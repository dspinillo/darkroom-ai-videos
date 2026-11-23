/**
 * Descoberta de pauta e pesquisa. Três fontes, todas públicas:
 *
 * - YouTube Data API (precisa de YOUTUBE_API_KEY, grátis no Google Cloud): o que já existe sobre o
 *   tema, com duração, idade e visualizações. Serve para medir **interesse**, não para baixar vídeo.
 * - Crossref (sem chave): papers e artigos acadêmicos recentes por busca bibliográfica.
 * - RSS/Atom (sem chave): blogs, jornais, newsletters e podcasts que você acompanha.
 *
 * Nada aqui decide pauta. O resultado é um dossiê para alguém (ou um agente) ler e escolher.
 */

export interface Reference {
  kind: "youtube" | "paper" | "feed";
  query: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  summary: string;
  viewCount?: number | null;
  durationSeconds?: number | null;
  authors?: string[];
  score: number;
  reasons: string[];
}

export interface Watchlist {
  queries: string[];
  lookbackDays?: number;
  maxResultsPerQuery?: number;
  youtube?: { enabled: boolean; regionCode?: string; relevanceLanguage?: string; order?: "relevance" | "viewCount" | "date" };
  crossref?: { enabled: boolean; contactEmail?: string | null };
  feeds?: Array<{ label: string; url: string }>;
}

async function getJson(url: URL): Promise<unknown> {
  // 429 é comum no Crossref sem e-mail de contato (fila "educada"): espera e tenta de novo.
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`${url.hostname} respondeu HTTP ${response.status}${response.status === 429 ? " (preencha crossref.contactEmail na watchlist)" : ""}`);
    return response.json();
  }
}

function isoDuration(value: string | undefined): number | null {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

const normalize = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLocaleLowerCase();

const stop = new Set(["com", "como", "das", "dos", "para", "por", "que", "uma", "the", "and", "for", "with"]);

/**
 * Pontua uma referência. Dois sinais de interesse convivem de propósito: novidade (atualidade) e
 * demanda que dura (visualizações por hora ao longo de meses). Um vídeo de um ano ainda somando 20
 * views/hora prova interesse perene; um de dois dias com mil não prova nada — toda estreia sobe.
 */
export function rank(reference: Omit<Reference, "score" | "reasons">, now = Date.now()): Reference {
  let score = 0;
  const reasons: string[] = [];
  const published = reference.publishedAt ? Date.parse(reference.publishedAt) : Number.NaN;
  if (Number.isFinite(published)) {
    const days = Math.max(0, now - published) / 86_400_000;
    if (days <= 2) (score += 40), reasons.push("novo (48 h)");
    else if (days <= 7) (score += 30), reasons.push("recente (7 dias)");
    else if (days <= 30) (score += 15), reasons.push("recente (30 dias)");
    if (reference.viewCount != null) {
      const hours = Math.max(1, (now - published) / 3_600_000);
      const perHour = reference.viewCount / hours;
      if (days >= 365 && perHour >= 20) (score += 35), reasons.push(`demanda perene (${perHour.toFixed(0)} views/h em ${Math.round(days)} dias)`);
      else if (days >= 90 && perHour >= 100) (score += 20), reasons.push(`demanda sustentada (${perHour.toFixed(0)} views/h)`);
    }
  }
  const terms = normalize(reference.query).split(/[^a-z0-9]+/u).filter((term) => term.length >= 3 && !stop.has(term));
  const title = normalize(reference.title);
  const hits = terms.filter((term) => title.includes(term)).length;
  if (terms.length && hits) (score += Math.round((30 * hits) / terms.length)), reasons.push("título casa com a busca");
  if ((reference.durationSeconds ?? 0) >= 300) (score += 20), reasons.push("formato longo");
  return { ...reference, score: Math.min(100, score), reasons };
}

export async function searchYouTube(watchlist: Watchlist): Promise<Reference[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY não está definida (ver docs/pauta-e-pesquisa.md → chave do YouTube)");
  const yt = watchlist.youtube ?? { enabled: true };
  const after = new Date(Date.now() - (watchlist.lookbackDays ?? 365) * 86_400_000).toISOString();
  const found: Reference[] = [];
  for (const query of watchlist.queries) {
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.search = new URLSearchParams({ part: "snippet", type: "video", q: query, maxResults: String(watchlist.maxResultsPerQuery ?? 10), publishedAfter: after, order: yt.order ?? "relevance", ...(yt.regionCode ? { regionCode: yt.regionCode } : {}), ...(yt.relevanceLanguage ? { relevanceLanguage: yt.relevanceLanguage } : {}), key }).toString();
    const result = (await getJson(search)) as { items: Array<{ id: { videoId: string }; snippet: { title: string; description: string; channelTitle: string; publishedAt: string } }> };
    const ids = result.items.map((item) => item.id.videoId).filter(Boolean);
    if (ids.length === 0) continue;
    const details = new URL("https://www.googleapis.com/youtube/v3/videos");
    details.search = new URLSearchParams({ part: "contentDetails,statistics", id: ids.join(","), key }).toString();
    const info = (await getJson(details)) as { items: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }> };
    const byId = new Map(info.items.map((item) => [item.id, item]));
    for (const item of result.items) {
      const detail = byId.get(item.id.videoId);
      // viewCount vem como texto e some quando o criador esconde a contagem.
      const views = detail?.statistics?.viewCount;
      found.push(
        rank({
          kind: "youtube",
          query,
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          source: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          summary: item.snippet.description,
          viewCount: views === undefined ? null : Number(views),
          durationSeconds: isoDuration(detail?.contentDetails?.duration),
        }),
      );
    }
  }
  return found;
}

export async function searchCrossref(watchlist: Watchlist): Promise<Reference[]> {
  const from = new Date(Date.now() - (watchlist.lookbackDays ?? 365) * 86_400_000).toISOString().slice(0, 10);
  const found: Reference[] = [];
  for (const query of watchlist.queries) {
    const url = new URL("https://api.crossref.org/works");
    url.search = new URLSearchParams({
      "query.bibliographic": query,
      rows: String(watchlist.maxResultsPerQuery ?? 10),
      filter: `from-pub-date:${from}`,
      select: "DOI,title,author,published,container-title,abstract,URL",
      ...(watchlist.crossref?.contactEmail ? { mailto: watchlist.crossref.contactEmail } : {}),
    }).toString();
    const body = (await getJson(url)) as { message: { items: Array<{ DOI: string; URL?: string; title?: string[]; author?: Array<{ given?: string; family?: string }>; published?: { "date-parts": number[][] }; "container-title"?: string[]; abstract?: string }> } };
    for (const item of body.message.items) {
      const parts = item.published?.["date-parts"][0];
      const date = parts ? new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1)).toISOString() : null;
      found.push(
        rank({
          kind: "paper",
          query,
          title: item.title?.[0] ?? "(sem título)",
          url: item.URL ?? `https://doi.org/${item.DOI}`,
          source: item["container-title"]?.[0] ?? "Crossref",
          publishedAt: date,
          summary: (item.abstract ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 600),
          authors: (item.author ?? []).map((author) => [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean).slice(0, 6),
        }),
      );
    }
  }
  return found;
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "iu"));
  return (match?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1").replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/\s+/gu, " ").trim();
}

/** RSS 2.0 e Atom, sem dependência: título, link, data e resumo de cada item. */
export function parseFeed(xml: string): Array<{ title: string; url: string; publishedAt: string | null; summary: string }> {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/giu) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/giu) ?? [];
  return items.map((item) => {
    const atomLink = item.match(/<link[^>]*href="([^"]+)"/iu)?.[1];
    const date = tag(item, "pubDate") || tag(item, "published") || tag(item, "updated");
    const parsed = date ? Date.parse(date) : Number.NaN;
    return {
      title: tag(item, "title"),
      url: atomLink ?? (tag(item, "link") || tag(item, "guid")),
      publishedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
      summary: (tag(item, "description") || tag(item, "summary") || tag(item, "content")).slice(0, 600),
    };
  });
}

export async function searchFeeds(watchlist: Watchlist): Promise<Reference[]> {
  const found: Reference[] = [];
  const since = Date.now() - (watchlist.lookbackDays ?? 365) * 86_400_000;
  for (const feed of watchlist.feeds ?? []) {
    if (!feed.url.startsWith("https://")) throw new Error(`feed sem HTTPS: ${feed.url}`);
    const response = await fetch(feed.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${feed.label} respondeu HTTP ${response.status}`);
    for (const item of parseFeed(await response.text())) {
      if (item.publishedAt && Date.parse(item.publishedAt) < since) continue;
      const text = normalize(`${item.title} ${item.summary}`);
      // Do feed só entra o que fala de alguma das buscas.
      const query = watchlist.queries.find((candidate) => normalize(candidate).split(/\s+/u).filter((term) => term.length >= 4).some((term) => text.includes(term)));
      if (!query) continue;
      found.push(rank({ kind: "feed", query, title: item.title, url: item.url, source: feed.label, publishedAt: item.publishedAt, summary: item.summary }));
    }
  }
  return found;
}

export function dossierMarkdown(title: string, references: Reference[]): string {
  const sections: Array<[Reference["kind"], string, string]> = [
    ["youtube", "O que já existe no YouTube", "Interesse do público. Não é fonte factual: um vídeo popular prova que o tema atrai, não que a afirmação dele é verdadeira."],
    ["paper", "Papers e artigos (Crossref)", "Fontes primárias candidatas. Leia o artigo antes de citar; o resumo pode não sustentar a manchete."],
    ["feed", "Feeds acompanhados", "Notícia e análise. Confirme o dado na fonte original que a matéria cita."],
  ];
  const lines = [`# Dossiê de pauta — ${title}`, "", `Gerado em ${new Date().toISOString().slice(0, 10)} pelo \`darkroom pesquisa\`. ${references.length} referências.`, ""];
  for (const [kind, heading, note] of sections) {
    const group = references.filter((reference) => reference.kind === kind).sort((a, b) => b.score - a.score);
    if (group.length === 0) continue;
    lines.push(`## ${heading}`, "", `> ${note}`, "");
    for (const reference of group) {
      const meta = [reference.source, reference.publishedAt?.slice(0, 10), reference.viewCount != null ? `${reference.viewCount.toLocaleString("pt-BR")} views` : null, reference.durationSeconds ? `${Math.round(reference.durationSeconds / 60)} min` : null, reference.authors?.length ? reference.authors.join(", ") : null].filter(Boolean).join(" · ");
      lines.push(`- **${reference.title}** (${reference.score}) — ${meta}`, `  ${reference.url}`, `  _busca:_ ${reference.query}${reference.reasons.length ? ` · _sinais:_ ${reference.reasons.join(", ")}` : ""}`);
      if (reference.summary) lines.push(`  ${reference.summary.slice(0, 280)}${reference.summary.length > 280 ? "…" : ""}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
