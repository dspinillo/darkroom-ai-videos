/**
 * Busca de b-roll em bancos com licença comercial (Pexels, Pixabay). Devolve **candidatos**, não
 * assets: nada entra no episódio sem alguém olhar.
 *
 * Por que a revisão é pela miniatura: num episódio real, de 9 candidatos escolhidos pelo nome da
 * busca, 3 serviram — os outros traziam logo de empresa, formulário de terceiro legível e tema
 * errado. Cada candidato traz `preview` (~80 KB); o pool inteiro custa ~25 MB contra centenas de
 * MB de vídeo. O banco acerta "pessoa fazendo X" e erra conceito: juros e crise não existem como
 * imagem; essas batidas são tipografia ou diagrama.
 */

export interface StockCandidate {
  provider: "pexels" | "pixabay";
  id: string;
  query: string;
  page: string;
  preview: string;
  download: string;
  width: number;
  height: number;
  seconds: number;
  author: string;
  authorUrl: string;
  license: string;
}

type Orientation = "landscape" | "portrait";

async function getJson(url: URL, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url.hostname} respondeu HTTP ${response.status}`);
  return response.json();
}

export async function searchPexels(query: string, orientation: Orientation, perPage: number): Promise<StockCandidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY não está definida (ver .env.example)");
  const url = new URL("https://api.pexels.com/v1/videos/search");
  url.search = new URLSearchParams({ query, orientation, size: "medium", per_page: String(perPage) }).toString();
  const body = (await getJson(url, { authorization: key })) as {
    videos: Array<{ id: number; url: string; image: string; duration: number; user: { name: string; url: string }; video_files: Array<{ link: string; width: number | null; height: number | null; file_type: string }> }>;
  };
  const target = orientation === "landscape" ? [1920, 1080] : [1080, 1920];
  return body.videos.flatMap((video) => {
    const file = video.video_files
      .filter((item) => item.file_type === "video/mp4" && item.width && item.height)
      .sort((a, b) => Math.abs((a.width ?? 0) - (target[0] ?? 0)) + Math.abs((a.height ?? 0) - (target[1] ?? 0)) - (Math.abs((b.width ?? 0) - (target[0] ?? 0)) + Math.abs((b.height ?? 0) - (target[1] ?? 0))))[0];
    if (!file) return [];
    return [{ provider: "pexels" as const, id: `pexels-${video.id}`, query, page: video.url, preview: video.image, download: file.link, width: file.width ?? 0, height: file.height ?? 0, seconds: video.duration, author: video.user.name, authorUrl: video.user.url, license: "https://www.pexels.com/license/" }];
  });
}

export async function searchPixabay(query: string, orientation: Orientation, perPage: number): Promise<StockCandidate[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error("PIXABAY_API_KEY não está definida (ver .env.example)");
  const url = new URL("https://pixabay.com/api/videos/");
  url.search = new URLSearchParams({ key, q: query, per_page: String(Math.max(3, perPage)), safesearch: "true" }).toString();
  const body = (await getJson(url)) as {
    hits: Array<{ id: number; pageURL: string; duration: number; user: string; user_id: number; videos: Record<string, { url: string; width: number; height: number; thumbnail: string } | undefined> }>;
  };
  return body.hits.flatMap((hit) => {
    const rendition = (["large", "medium", "small"] as const).map((size) => hit.videos[size]).find((item) => item && item.url && item.width > 0);
    if (!rendition) return [];
    const portrait = rendition.height > rendition.width;
    if ((orientation === "portrait") !== portrait) return [];
    return [{ provider: "pixabay" as const, id: `pixabay-${hit.id}`, query, page: hit.pageURL, preview: rendition.thumbnail, download: rendition.url, width: rendition.width, height: rendition.height, seconds: hit.duration, author: hit.user, authorUrl: `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`, license: "https://pixabay.com/service/license/" }];
  });
}

/** Folha de contato em HTML: abra no navegador, elimine rápido, só o finalista merece o clipe. */
export function contactSheetHtml(candidates: StockCandidate[]): string {
  const escape = (value: string) => value.replace(/[&<>"]/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
  const cards = candidates
    .map(
      (c) => `<figure><a href="${escape(c.page)}" target="_blank" rel="noreferrer"><img loading="lazy" src="${escape(c.preview)}" alt=""></a>
<figcaption><b>${escape(c.id)}</b> · ${c.seconds}s · ${c.width}×${c.height}<br>“${escape(c.query)}” · ${escape(c.author)}</figcaption></figure>`,
    )
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Candidatos de b-roll</title>
<style>body{font:14px system-ui;background:#111;color:#ddd;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#222}figure{margin:0}figcaption{padding:6px 2px;line-height:1.4}</style>
<h1>${candidates.length} candidatos</h1><p>Elimine pela miniatura. Antes de aprovar, assista ao clipe: a miniatura é um frame só, escolhido pelo provedor.</p><main>${cards}</main>`;
}
