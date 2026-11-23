import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { planChunks } from "../core/timeline.ts";
import type { EpisodeProps } from "../compositions/Episode.tsx";
import { browserExecutable, chromiumOptions, launchBrowser } from "./browser.ts";
import { countVideoFrames, run } from "./ffmpeg.ts";

/**
 * Motor ao vivo: o Remotion renderiza o episódio em blocos de vídeo **sem áudio**, que depois são
 * concatenados e recebem o áudio master uma vez só.
 *
 * - Bloco: uma queda custa um bloco, não o episódio; e o bloco pronto é reaproveitado (retomada).
 * - Sem áudio: AAC por bloco carrega padding. Num episódio real, juntar blocos com áudio deu
 *   489,152 s para uma timeline de 488,667 s. Codificar o áudio uma vez elimina o acúmulo.
 * - Concorrência baixa: 4 rendeu 3% e 8 piorou 31% no mesmo hardware. A alavanca é o `gl`.
 */
export async function renderLive(options: {
  serveUrl: string;
  props: EpisodeProps;
  outDir: string;
  /** Blocos são reaproveitados só se nada visual mudou: a pasta é a do hash do plano. */
  planHash: string;
  chunkFrames?: number;
  concurrency?: number;
  frameRange?: [number, number];
  log: (message: string) => void;
}): Promise<string> {
  const chunkDir = path.join(options.outDir, "chunks", options.planHash.slice(0, 12));
  mkdirSync(chunkDir, { recursive: true });
  const browser = await launchBrowser();
  const parts: string[] = [];
  try {
    const composition = await selectComposition({
      serveUrl: options.serveUrl,
      id: "Episode",
      inputProps: options.props,
      puppeteerInstance: browser,
      chromiumOptions: chromiumOptions(),
      browserExecutable: browserExecutable(),
    });
    const total = composition.durationInFrames;
    const chunks = options.frameRange ? [options.frameRange] : planChunks(total, options.chunkFrames ?? 1800);
    for (const [index, [start, end]] of chunks.entries()) {
      const output = path.join(chunkDir, `chunk-${String(start).padStart(6, "0")}-${String(end).padStart(6, "0")}.mp4`);
      parts.push(output);
      const expected = end - start + 1;
      if (existsSync(output) && countVideoFrames(output) === expected) {
        options.log(`bloco ${index + 1}/${chunks.length} já existe (${expected} frames) — reaproveitado`);
        continue;
      }
      rmSync(output, { force: true });
      options.log(`bloco ${index + 1}/${chunks.length}: frames ${start}–${end}`);
      let lastBucket = -1;
      await renderMedia({
        serveUrl: options.serveUrl,
        composition,
        inputProps: options.props,
        frameRange: [start, end],
        outputLocation: output,
        codec: "h264",
        muted: true,
        pixelFormat: "yuv420p",
        imageFormat: "jpeg",
        jpegQuality: 92,
        crf: 18,
        x264Preset: "veryfast",
        concurrency: options.concurrency ?? 2,
        puppeteerInstance: browser,
        chromiumOptions: chromiumOptions(),
        browserExecutable: browserExecutable(),
        offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024,
        onProgress: ({ progress }) => {
          const bucket = Math.floor(progress * 4);
          if (bucket > lastBucket) {
            lastBucket = bucket;
            options.log(`  ${Math.round(progress * 100)}%`);
          }
        },
      });
      const frames = countVideoFrames(output);
      if (frames !== expected) throw new Error(`bloco ${output} saiu com ${frames} frames, esperado ${expected}`);
    }
  } finally {
    await browser.close({ silent: true });
  }
  const list = path.join(chunkDir, "chunks.ffconcat");
  writeFileSync(list, `ffconcat version 1.0\n${parts.map((file) => `file '${file}'`).join("\n")}\n`);
  const video = path.join(options.outDir, "video-only.mp4");
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v:0", "-c:v", "copy", "-an", video]);
  return video;
}
