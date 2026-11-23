import { createHash } from "node:crypto";
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import type { EpisodeProps } from "./compositions/Episode.tsx";
import { buildCaptions, toSrt, toVtt } from "./core/captions.ts";
import { type Episode, parseEpisode } from "./core/episode.ts";
import { type Issue, type Timeline, auditTimeline, buildTimeline } from "./core/timeline.ts";
import { type Narration, buildNarration, voicePlan } from "./providers/tts.ts";
import { buildMasterAudio, defaultTarget } from "./render/audio.ts";
import { chromiumOptions, killOrphanBrowsers } from "./render/browser.ts";
import { run, sha256 } from "./render/ffmpeg.ts";
import { renderLive } from "./render/live.ts";
import { readSegments, renderStills } from "./render/stills.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEpisode(dir: string): Episode {
  const file = path.join(dir, "episode.json");
  if (!existsSync(file)) throw new Error(`não achei ${file}`);
  return parseEpisode(JSON.parse(readFileSync(file, "utf8")));
}

export function outDirOf(dir: string) {
  return path.join(dir, "out");
}

/** Só o que o episódio declara entra no render: o diretório público é montado, não apontado. */
function stagePublic(dir: string, episode: Episode, publicDir: string) {
  mkdirSync(publicDir, { recursive: true });
  const files = [...episode.assets.map((asset) => asset.file), ...(episode.music ? [episode.music.file] : [])];
  for (const file of files) {
    const source = path.resolve(dir, file);
    if (!existsSync(source)) throw new Error(`asset declarado e ausente: ${file}`);
    const target = path.join(publicDir, file);
    if (existsSync(target)) {
      // Mesmo arquivo (hard link) ou cópia idêntica: mantém. Asset regerado: substitui.
      const [a, b] = [statSync(source), statSync(target)];
      if (a.ino === b.ino || (a.size === b.size && a.mtimeMs <= b.mtimeMs)) continue;
      rmSync(target);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    try {
      linkSync(source, target);
    } catch {
      copyFileSync(source, target);
    }
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Hash do código que desenha: cenas, composições, motion e tema. */
function sourceFingerprint(): string {
  const hash = createHash("sha256");
  for (const dir of ["src/scenes", "src/compositions", "src/motion", "src/theme", "src/core"]) {
    for (const file of walk(path.join(root, dir)).sort()) hash.update(file.slice(root.length)).update(readFileSync(file));
  }
  return hash.digest("hex");
}

/** Tamanho e data de cada asset: barato e muda quando o arquivo muda. */
function assetFingerprint(publicDir: string, episode: Episode): string[] {
  return [...episode.assets.map((asset) => asset.file), ...(episode.music ? [episode.music.file] : [])].map((file) => {
    const stat = statSync(path.join(publicDir, file));
    return `${file}:${stat.size}:${Math.round(stat.mtimeMs)}`;
  });
}

function printIssues(issues: Issue[], log: (message: string) => void) {
  for (const issue of issues) log(`${issue.level === "error" ? "ERRO " : "aviso"} ${issue.scene ? `[${issue.scene}] ` : ""}${issue.message}`);
}

export interface Plan {
  episode: Episode;
  narration: Narration;
  timeline: Timeline;
  issues: Issue[];
}

/** Valida, monta a voz (cache primeiro) e a timeline. Não renderiza nada. */
export async function plan(dir: string, options: { allowPaid: boolean; log: (message: string) => void }): Promise<Plan> {
  const episode = loadEpisode(dir);
  const out = outDirOf(dir);
  const cacheDir = path.join(out, "voice");
  const pending = voicePlan(episode, cacheDir, dir).filter((item) => !item.cached);
  options.log(`${episode.blocks.length} blocos de voz (${episode.voice.provider}); ${pending.length} fora do cache, ${pending.reduce((sum, item) => sum + item.characters, 0)} caracteres`);
  const narration = await buildNarration({ episode, dir, cacheDir, output: path.join(out, "public", "narration.wav"), allowPaid: options.allowPaid, log: options.log });
  if (narration.estimated) options.log("aviso tempo de fala ESTIMADO (provedor sem alinhamento): confira legenda e cortes no ouvido antes de entregar");
  const timeline = buildTimeline(episode, narration.words, narration.seconds);
  const issues = auditTimeline(episode, timeline);
  printIssues(issues, options.log);
  options.log(`${timeline.scenes.length} cenas, ${timeline.totalFrames} frames (${(timeline.totalFrames / timeline.fps).toFixed(1)} s), motor ${episode.engine}`);
  return { episode, narration, timeline, issues };
}

function nextVersion(out: string, id: string): string {
  for (let version = 1; ; version += 1) {
    const file = path.join(out, `${id}-v${version}.mp4`);
    if (!existsSync(file)) return file;
  }
}

export async function produce(dir: string, options: { allowPaid: boolean; frameRange?: [number, number]; log: (message: string) => void }) {
  const started = Date.now();
  const planned = await plan(dir, options);
  const { episode, narration, timeline, issues } = planned;
  if (issues.some((issue) => issue.level === "error")) throw new Error("o episódio tem erros editoriais (acima). Corrija antes de renderizar.");
  const out = outDirOf(dir);
  const publicDir = path.join(out, "public");
  stagePublic(dir, episode, publicDir);

  const cues = buildCaptions(narration.words);
  writeFileSync(path.join(out, `${episode.id}.srt`), toSrt(cues));
  writeFileSync(path.join(out, `${episode.id}.vtt`), toVtt(cues));
  const burnCaptions = (episode.captions ?? (episode.engine === "live" ? "burn" : "sidecar")) === "burn";
  if (burnCaptions && episode.engine === "stills") throw new Error('o motor de stills não queima legenda; use captions: "sidecar"');

  const totalSeconds = timeline.totalFrames / timeline.fps;
  const master = path.join(out, "master.wav");
  const audio = buildMasterAudio({ narration: narration.file, music: episode.music ? { file: path.join(publicDir, episode.music.file), volumeDb: episode.music.volumeDb } : undefined, totalSeconds, output: master });
  options.log(audio.silent ? "áudio: narração muda, sem normalização" : `áudio: ${audio.measured.integrated} LUFS → ${audio.target.integrated} LUFS com ganho constante de ${audio.gainDb} dB`);

  const props: EpisodeProps = {
    timeline,
    assets: episode.assets,
    channelName: episode.channelName,
    theme: episode.theme,
    cues,
    burnCaptions,
    narration: "narration.wav",
    music: episode.music ? { file: episode.music.file, volumeDb: episode.music.volumeDb } : null,
  };
  // O hash cobre tudo que muda a imagem: props, motor, código das cenas e conteúdo dos assets.
  // Sem código e assets aqui, um bloco antigo seria reaproveitado depois de uma correção visual.
  const planHash = createHash("sha256")
    .update(JSON.stringify({ props, engine: episode.engine, source: sourceFingerprint(), assets: assetFingerprint(publicDir, episode) }))
    .digest("hex");

  killOrphanBrowsers();
  options.log("empacotando composições…");
  const serveUrl = await bundle({ entryPoint: path.join(root, "src/compositions/index.ts"), publicDir, outDir: path.join(out, "bundle") });
  const videoOnly =
    episode.engine === "live"
      ? await renderLive({ serveUrl, props, outDir: out, planHash, frameRange: options.frameRange, log: options.log })
      : await renderStills({ serveUrl, timeline, assets: episode.assets, channelName: episode.channelName, theme: episode.theme, outDir: out, planHash, log: options.log });

  // Áudio codificado uma vez, contra a timeline exata. Nunca sobrescreve uma entrega anterior.
  const final = options.frameRange ? path.join(out, `${episode.id}-trecho-${options.frameRange[0]}-${options.frameRange[1]}.mp4`) : nextVersion(out, episode.id);
  const range = options.frameRange;
  const audioArgs = range ? ["-ss", String(range[0] / timeline.fps), "-t", String((range[1] - range[0] + 1) / timeline.fps)] : [];
  const duration = range ? (range[1] - range[0] + 1) / timeline.fps : totalSeconds;
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", videoOnly, ...audioArgs, "-i", master, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", duration.toFixed(3), "-movflags", "+faststart", "-metadata", `title=${episode.title}`, final]);

  const manifest = {
    output: final,
    sha256: await sha256(final),
    episode: episode.id,
    engine: episode.engine,
    format: episode.format,
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps,
    totalFrames: range ? range[1] - range[0] + 1 : timeline.totalFrames,
    partial: Boolean(range),
    cutFrames: timeline.scenes.map((scene) => scene.startFrame),
    planHash,
    gl: chromiumOptions().gl,
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? "remotion-headless-shell",
    burnCaptions,
    timingEstimated: narration.estimated,
    voiceProvider: episode.voice.provider,
    paidCharacters: narration.paidCharacters,
    audio: { ...audio, target: defaultTarget },
    warnings: issues.filter((issue) => issue.level === "warning"),
    renderSeconds: Math.round((Date.now() - started) / 1000),
    humanReviewed: false,
  };
  writeFileSync(path.join(out, "render-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const segments = episode.engine === "stills" ? readSegments(out, planHash) : null;
  return { final, manifest, segments, timeline };
}
