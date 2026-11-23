#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTarget } from "../render/audio.ts";
import { doctor } from "./doctor.ts";
import { prepareDemo, demoNames } from "./demo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const log = (message: string) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${message}`);

const help = `darkroom — fábrica de vídeo para canal dark

  darkroom doctor                       confere Node, FFmpeg, navegador, chaves (sem imprimir valor) e TMPDIR
  darkroom demo [${demoNames.join("|")}]   gera e renderiza um episódio de exemplo, sem chave nenhuma
  darkroom plan <pasta>                 valida o episódio, monta a voz e a timeline, mostra custo e avisos
  darkroom render <pasta> [opções]      plano + render + mux; nunca sobrescreve um MP4 anterior
      --live                            autoriza gastar crédito de voz (ElevenLabs) nos blocos fora do cache
      --detach                          roda destacado da sessão, com log em arquivo (recomendado para render longo)
      --frames=INICIO-FIM               renderiza só um trecho, para conferir uma cena
  darkroom qa <pasta>                   QA do último render: frames, relógio, decodificação, loudness, piscadas, fronteiras
  darkroom novo <pasta>                 cria a pasta do episódio com brief.md e watchlist.json para preencher
  darkroom pesquisa <pasta>             busca no YouTube (YOUTUBE_API_KEY), Crossref e RSS → dossie.md
  darkroom roteiro <pasta> [--minutos=8] [--agente=claude|codex]
                                        rascunho de episode.json pelo Claude Code ou Codex, na sua assinatura (sem chave)
  darkroom stock <consulta>... [--provider=pexels|pixabay] [--orientation=landscape|portrait] [--per=8] [--out=pasta]
                                        busca candidatos de b-roll e gera uma folha de contato para revisão
  darkroom stock --baixar <candidates.json> <id>... --para=<pasta>/assets
                                        baixa os escolhidos e imprime o trecho de "assets" com crédito e licença

Variáveis: ver .env.example. RENDER_GL (angle|swangle), RENDER_TMPDIR, REMOTION_BROWSER_EXECUTABLE.`;

function flag(args: string[], name: string): string | undefined {
  const hit = args.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

function loadEnv() {
  for (const file of [path.resolve(".env"), path.join(root, ".env")]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}

/** O Chrome do Remotion guarda o perfil no TMPDIR. Render longo escreve muito: aponte para disco externo. */
function useRenderTmp(out: string) {
  const dir = process.env.RENDER_TMPDIR ?? path.join(out, "tmp");
  mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = dir;
}

function detach(argv: string[], out: string) {
  mkdirSync(out, { recursive: true });
  const logFile = path.join(out, `render-${new Date().toISOString().replace(/[:.]/gu, "-")}.log`);
  const fd = openSync(logFile, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv.filter((arg) => arg !== "--detach")], { detached: true, stdio: ["ignore", fd, fd], env: process.env });
  child.unref();
  writeFileSync(path.join(out, "render.pid"), String(child.pid));
  console.log(`render destacado (pid ${child.pid}). Acompanhe com:\n  tail -f "${logFile}"`);
}

async function main() {
  loadEnv();
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "doctor":
      process.exitCode = doctor() ? 0 : 1;
      return;
    case "demo": {
      const name = args[0] ?? "editorial";
      const dir = prepareDemo(name, log);
      useRenderTmp(path.join(dir, "out"));
      const { produce } = await import("../pipeline.ts");
      const result = await produce(dir, { allowPaid: false, log });
      log(`pronto: ${result.final}`);
      await qa(dir);
      return;
    }
    case "plan": {
      const dir = path.resolve(args[0] ?? ".");
      const { plan } = await import("../pipeline.ts");
      const result = await plan(dir, { allowPaid: Boolean(flag(args, "live")), log });
      if (result.issues.some((issue) => issue.level === "error")) process.exitCode = 1;
      return;
    }
    case "render": {
      const dir = path.resolve(args[0] ?? ".");
      const out = path.join(dir, "out");
      if (flag(args, "detach")) return detach(process.argv.slice(2), out);
      useRenderTmp(out);
      const frames = flag(args, "frames")?.split("-").map(Number);
      const { produce } = await import("../pipeline.ts");
      const result = await produce(dir, { allowPaid: Boolean(flag(args, "live")), frameRange: frames && frames.length === 2 ? [frames[0] ?? 0, frames[1] ?? 0] : undefined, log });
      log(`pronto: ${result.final}\n  próximo passo: darkroom qa ${args[0] ?? "."}`);
      return;
    }
    case "qa":
      await qa(path.resolve(args[0] ?? "."));
      return;
    case "novo": {
      const dir = path.resolve(args[0] ?? "");
      if (!args[0]) throw new Error("passe a pasta do episódio: darkroom novo episodios/ep001");
      if (existsSync(path.join(dir, "brief.md"))) throw new Error(`${dir} já tem brief.md; nada foi sobrescrito`);
      mkdirSync(path.join(dir, "assets"), { recursive: true });
      copyFileSync(path.join(root, "templates/audience-brief.md"), path.join(dir, "brief.md"));
      copyFileSync(path.join(root, "templates/watchlist.json"), path.join(dir, "watchlist.json"));
      log(`criado ${dir}\n  1. preencha brief.md e as buscas em watchlist.json\n  2. darkroom pesquisa ${args[0]}\n  3. darkroom roteiro ${args[0]}   (ou siga docs/agente-roteiro.md num agente)`);
      return;
    }
    case "pesquisa": {
      const dir = path.resolve(args[0] ?? ".");
      const watch = JSON.parse(readFileSync(path.join(dir, "watchlist.json"), "utf8"));
      const { searchYouTube, searchCrossref, searchFeeds, dossierMarkdown } = await import("../research/sources.ts");
      const found = [];
      for (const [label, enabled, run] of [
        ["YouTube", watch.youtube?.enabled !== false, searchYouTube],
        ["Crossref", watch.crossref?.enabled !== false, searchCrossref],
        ["feeds", (watch.feeds ?? []).length > 0, searchFeeds],
      ] as const) {
        if (!enabled) continue;
        try {
          const result = await run(watch);
          log(`${label}: ${result.length} referências`);
          found.push(...result);
        } catch (error) {
          log(`aviso ${label} ficou de fora: ${error instanceof Error ? error.message : error}`);
        }
      }
      const unique = [...new Map(found.map((item) => [item.url, item])).values()];
      writeFileSync(path.join(dir, "dossie.json"), `${JSON.stringify(unique, null, 2)}\n`);
      writeFileSync(path.join(dir, "dossie.md"), dossierMarkdown(path.basename(dir), unique));
      log(`dossiê em ${path.join(dir, "dossie.md")} — leia antes de escrever: interesse do público e fato verdadeiro são perguntas diferentes`);
      return;
    }
    case "roteiro": {
      const dir = path.resolve(args[0] ?? ".");
      const { draftScript } = await import("../research/script.ts");
      await draftScript({ dir, minutes: Number(flag(args, "minutos") ?? 8), agent: (flag(args, "agente") ?? "claude") as "claude" | "codex", log });
      return;
    }
    case "stock": {
      if (flag(args, "baixar")) {
        const [file, ...ids] = args.filter((arg) => !arg.startsWith("--"));
        const target = path.resolve(flag(args, "para") ?? "assets");
        mkdirSync(target, { recursive: true });
        const candidates = JSON.parse(readFileSync(path.resolve(file ?? ""), "utf8")) as Array<{ id: string; download: string; page: string; author: string; license: string; provider: string }>;
        const assets = [];
        for (const id of ids) {
          const item = candidates.find((candidate) => candidate.id === id);
          if (!item) throw new Error(`candidato ${id} não está em ${file}`);
          const response = await fetch(item.download);
          if (!response.ok) throw new Error(`download de ${id} falhou: HTTP ${response.status}`);
          writeFileSync(path.join(target, `${id}.mp4`), Buffer.from(await response.arrayBuffer()));
          assets.push({ id, file: `assets/${id}.mp4`, kind: "video", credit: `${item.author} / ${item.provider === "pexels" ? "Pexels" : "Pixabay"}`, license: item.license, source: item.page });
          log(`baixado ${id}`);
        }
        console.log(JSON.stringify(assets, null, 2));
        return;
      }
      const { searchPexels, searchPixabay, contactSheetHtml } = await import("../providers/stock/search.ts");
      const queries = args.filter((arg) => !arg.startsWith("--"));
      if (queries.length === 0) throw new Error("passe ao menos uma consulta");
      const provider = flag(args, "provider") ?? "pexels";
      const orientation = (flag(args, "orientation") ?? "landscape") as "landscape" | "portrait";
      const per = Number(flag(args, "per") ?? 8);
      const search = provider === "pixabay" ? searchPixabay : searchPexels;
      const found = (await Promise.all(queries.map((query) => search(query, orientation, per)))).flat();
      const unique = [...new Map(found.map((item) => [item.id, item])).values()];
      const out = path.resolve(flag(args, "out") ?? "stock-candidates");
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, "candidates.json"), `${JSON.stringify(unique, null, 2)}\n`);
      writeFileSync(path.join(out, "candidates.html"), contactSheetHtml(unique));
      log(`${unique.length} candidatos em ${out}/candidates.html — nenhum baixado; escolha pela miniatura`);
      return;
    }
    default:
      console.log(help);
      if (command && command !== "help" && command !== "--help") process.exitCode = 1;
  }
}

async function qa(dir: string) {
  const out = path.join(dir, "out");
  const manifestFile = path.join(out, "render-manifest.json");
  if (!existsSync(manifestFile)) throw new Error(`não há render em ${out}; rode darkroom render primeiro`);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const { runQa } = await import("../qa/index.ts");
  const { readSegments } = await import("../render/stills.ts");
  const result = await runQa({
    video: manifest.output,
    outDir: out,
    fps: manifest.fps,
    expectedFrames: manifest.totalFrames,
    cutFrames: manifest.partial ? undefined : manifest.cutFrames,
    segments: manifest.engine === "stills" && !manifest.partial ? (readSegments(out, manifest.planHash) ?? undefined) : undefined,
    loudness: { ...defaultTarget, tolerance: 0.5 },
    log,
  });
  if (manifest.timingEstimated) log("aviso tempo de fala estimado: o QA técnico passou, mas legenda e cortes precisam de conferência no ouvido");
  log(result.ok ? "QA técnico passou. Agora assista: o QA não vê estética, sincronia nem direitos." : "QA REPROVOU — veja qa-report.json");
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
