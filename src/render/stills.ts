import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { ShotProps } from "../compositions/Episode.tsx";
import type { Asset } from "../core/episode.ts";
import type { Timeline } from "../core/timeline.ts";
import type { ThemeName } from "../theme/theme.ts";
import { browserExecutable, chromiumOptions, launchBrowser } from "./browser.ts";
import { run } from "./ffmpeg.ts";

/**
 * Motor de stills: o Remotion vira **compositor de quadros**, o FFmpeg faz o movimento.
 *
 * Serve ao documentário de arquivo: foto, documento, mapa, cartões. Cada plano é renderizado uma
 * vez como PNG — a foto em uma camada, o texto em outra — e o FFmpeg aplica o movimento de câmera
 * lento (zoompan) só no fundo. Só os quadros que mudam passam pelo Chrome; um episódio de 13 min
 * vira ~65 PNGs em vez de 24 mil frames de navegador.
 *
 * O preço: nada anima dentro do plano além da câmera. Entrada de texto, digitação e efeitos da
 * galeria aparecem no estado final. Precisa disso? Use o motor ao vivo.
 */
export async function renderStills(options: {
  serveUrl: string;
  timeline: Timeline;
  assets: Asset[];
  channelName: string;
  theme: ThemeName;
  outDir: string;
  /** Muda quando qualquer entrada visual muda: stills antigos nunca são reaproveitados por engano. */
  planHash: string;
  log: (message: string) => void;
}): Promise<string> {
  const { timeline } = options;
  const fps = timeline.fps;
  const ticks = 90000 / fps;
  if (!Number.isInteger(ticks)) throw new Error(`fps ${fps} não divide 90000; use 24, 25, 30 ou 60`);
  const stillDir = path.join(options.outDir, "stills", options.planHash.slice(0, 12));
  const segmentDir = path.join(options.outDir, "segments", options.planHash.slice(0, 12));
  mkdirSync(stillDir, { recursive: true });
  mkdirSync(segmentDir, { recursive: true });

  const layersOf = (type: string): ShotProps["layer"][] => (type === "photo" ? ["background", "overlay"] : ["composite"]);
  const browser = await launchBrowser();
  try {
    for (const [ordinal, scene] of timeline.scenes.entries()) {
      for (const layer of layersOf(scene.type)) {
        const file = path.join(stillDir, `${scene.id}-${layer}.png`);
        if (existsSync(file)) continue;
        const inputProps: ShotProps = { scene, ordinal, assets: options.assets, channelName: options.channelName, theme: options.theme, layer, width: timeline.width, height: timeline.height };
        const composition = await selectComposition({ serveUrl: options.serveUrl, id: "Shot", inputProps, puppeteerInstance: browser, chromiumOptions: chromiumOptions(), browserExecutable: browserExecutable() });
        await renderStill({ serveUrl: options.serveUrl, composition, inputProps, frame: 0, output: file, imageFormat: "png", puppeteerInstance: browser, chromiumOptions: chromiumOptions(), browserExecutable: browserExecutable() });
      }
      options.log(`still ${ordinal + 1}/${timeline.scenes.length}: ${scene.id} (${scene.type})`);
    }
  } finally {
    await browser.close({ silent: true });
  }

  const { width, height } = timeline;
  const lines = ["ffconcat version 1.0"];
  for (const [index, scene] of timeline.scenes.entries()) {
    const output = path.join(segmentDir, `${scene.id}.mp4`);
    const frames = scene.durationFrames;
    if (!existsSync(output)) {
      const args = ["-hide_banner", "-loglevel", "error", "-y"];
      const encode = ["-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), "-video_track_timescale", "90000"];
      const isLast = index === timeline.scenes.length - 1;
      const fade = isLast ? `,fade=t=out:st=${Math.max(0, (frames - 2 * fps) / fps)}:d=2` : "";
      if (scene.type === "photo") {
        const denominator = Math.max(1, frames - 1);
        const zoom = scene.motion === "pull" ? `1.045-0.045*on/${denominator}` : `1+0.045*on/${denominator}`;
        args.push(
          "-i", path.join(stillDir, `${scene.id}-background.png`),
          "-loop", "1", "-framerate", String(fps), "-i", path.join(stillDir, `${scene.id}-overlay.png`),
          "-filter_complex",
          `[0:v]scale=${width * 2}:${height * 2}:flags=lanczos,zoompan=z='${zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${width}x${height}:fps=${fps}[bg];[bg][1:v]overlay=0:0:shortest=1,format=yuv420p${fade}[v]`,
          "-map", "[v]",
        );
      } else {
        args.push("-loop", "1", "-framerate", String(fps), "-i", path.join(stillDir, `${scene.id}-composite.png`));
        if (fade) args.push("-vf", fade.slice(1));
      }
      run("ffmpeg", [...args, ...encode, output]);
    }
    verifySegment(output, frames, ticks, scene.id);
    // Duração explícita por arquivo: o cabeçalho MP4 arredonda e o erro acumula numa junção longa.
    lines.push(`file '${output}'`, `duration ${frames / fps}`);
    options.log(`segmento ${index + 1}/${timeline.scenes.length}: ${scene.id} (${(frames / fps).toFixed(1)} s)`);
  }
  const list = path.join(segmentDir, "segments.ffconcat");
  writeFileSync(list, `${lines.join("\n")}\n`);
  const video = path.join(options.outDir, "video-only.mp4");
  // Junção sem reencode, com PTS travados no passo exato de um frame.
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-map", "0:v:0", "-c:v", "copy",
    "-bsf:v", `setts=time_base=1/90000:pts=round(PTS/${ticks})*${ticks}:dts=round(DTS/${ticks})*${ticks}:duration=${ticks}`,
    "-video_track_timescale", "90000", "-an", video,
  ]);
  writeFileSync(path.join(segmentDir, "segments.json"), JSON.stringify(timeline.scenes.map((scene) => ({ id: scene.id, startFrame: scene.startFrame, durationFrames: scene.durationFrames, file: path.join(segmentDir, `${scene.id}.mp4`) })), null, 2));
  return video;
}

/**
 * Um segmento com base de tempo diferente dos outros entra fora do lugar na junção, mesmo com 30 fps
 * nos dois. Num episódio real, 1/90000 contra 1/15360 fez um plano aparecer sem a inscrição certa
 * aos 700 s, com contagem de frames e duração aparentemente corretas.
 */
export function verifySegment(file: string, frames: number, ticks: number, id: string): void {
  const out = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=time_base:packet=pts,duration", "-of", "json", file]).stdout;
  const data = JSON.parse(out) as { streams: Array<{ time_base: string }>; packets: Array<{ pts: number; duration: number }> };
  if (data.streams[0]?.time_base !== "1/90000") throw new Error(`segmento ${id}: time_base ${data.streams[0]?.time_base}, esperado 1/90000`);
  const packets = data.packets.sort((a, b) => a.pts - b.pts);
  if (packets.length !== frames) throw new Error(`segmento ${id}: ${packets.length} frames, esperado ${frames}`);
  for (const [index, packet] of packets.entries()) {
    if (packet.pts !== index * ticks || packet.duration !== ticks) {
      throw new Error(`segmento ${id}: frame ${index} com pts ${packet.pts}/duração ${packet.duration}, esperado ${index * ticks}/${ticks}`);
    }
  }
}

export function readSegments(outDir: string, planHash: string) {
  const file = path.join(outDir, "segments", planHash.slice(0, 12), "segments.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Array<{ id: string; startFrame: number; durationFrames: number; file: string }>) : null;
}
