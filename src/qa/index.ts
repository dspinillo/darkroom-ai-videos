import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { countVideoFrames, measureLoudness, probe, run, sha256, streamFfmpeg } from "../render/ffmpeg.ts";
import { FrameStreamScanner } from "./frame-spikes.ts";

/**
 * QA de entrega. Cada verificação pega uma classe de defeito que já passou despercebida — e nenhuma
 * delas substitui alguém olhar os frames e ouvir a voz. O relatório diz o que verificou e o que não.
 */

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface QaOptions {
  video: string;
  outDir: string;
  fps: number;
  expectedFrames?: number;
  /** Frames de início de cada cena: gera a folha de contato das fronteiras. */
  cutFrames?: number[];
  /** Segmentos do motor de stills: compara cada um com o vídeo montado. */
  segments?: Array<{ id: string; startFrame: number; durationFrames: number; file: string }>;
  loudness?: { integrated: number; truePeak: number; tolerance: number } | null;
  log: (message: string) => void;
}

function grayFrame(file: string, frame: number, fps: number): Buffer {
  const result = spawnSync("ffmpeg", ["-v", "error", "-ss", String(frame / fps), "-i", file, "-frames:v", "1", "-vf", "scale=160:90,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1_000_000 });
  if (result.status !== 0 || result.stdout.length !== 160 * 90) throw new Error(`não consegui extrair o frame ${frame} de ${file}`);
  return result.stdout;
}

export async function runQa(options: QaOptions) {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    options.log(`${ok ? "ok  " : "FALHA"} ${name}: ${detail}`);
  };
  const { video, fps } = options;
  const info = probe(video);
  const v = info.video;
  add("stream de vídeo", Boolean(v && v.codec_name === "h264"), v ? `${v.codec_name} ${v.width}×${v.height} ${v.r_frame_rate}` : "ausente");
  add("stream de áudio", Boolean(info.audio && info.audio.codec_name === "aac"), info.audio ? `${info.audio.codec_name} ${info.audio.sample_rate} Hz, ${info.audio.channels} canais` : "ausente");

  const frames = countVideoFrames(video);
  if (options.expectedFrames !== undefined) {
    add("contagem de frames", frames === options.expectedFrames, `${frames} de ${options.expectedFrames}`);
    const expectedSeconds = options.expectedFrames / fps;
    add("duração do container", Math.abs(info.duration - expectedSeconds) < 0.1, `${info.duration.toFixed(3)} s para ${expectedSeconds.toFixed(3)} s de timeline`);
  }

  // PTS de cada pacote no passo exato de um frame: duração certa no cabeçalho não prova isso.
  const packets = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=time_base:packet=pts", "-of", "json", video]).stdout) as { streams: Array<{ time_base: string }>; packets: Array<{ pts: number }> };
  const [num, den] = (packets.streams[0]?.time_base ?? "1/1").split("/").map(Number);
  const step = (den ?? 1) / (num ?? 1) / fps;
  const pts = packets.packets.map((packet) => packet.pts).sort((a, b) => a - b);
  const first = pts[0] ?? 0;
  const irregular = pts.findIndex((value, index) => Math.abs(value - first - index * step) > 1);
  add("relógio dos frames", irregular === -1, irregular === -1 ? `${pts.length} pacotes em passo uniforme` : `frame ${irregular} fora do passo`);

  const decode = spawnSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  add("decodificação integral", decode.status === 0 && !(decode.stderr ?? "").trim(), decode.status === 0 ? "todos os pacotes decodificam" : (decode.stderr ?? "").slice(0, 300));

  if (options.loudness && info.audio) {
    const loud = measureLoudness(video);
    const target = options.loudness;
    const silent = !Number.isFinite(loud.integrated) || loud.integrated < -60;
    add(
      "loudness",
      silent || (Math.abs(loud.integrated - target.integrated) <= target.tolerance && loud.truePeak <= target.truePeak + 0.2),
      silent ? "narração muda (provedor silence) — não medida" : `${loud.integrated} LUFS / ${loud.truePeak} dBTP (alvo ${target.integrated} ±${target.tolerance}, pico ≤ ${target.truePeak})`,
    );
  }

  options.log(`varrendo ${frames} frames atrás de piscadas…`);
  const scanner = new FrameStreamScanner(160 * 90);
  await streamFfmpeg(["-v", "error", "-i", video, "-an", "-vf", "scale=160:90,format=gray", "-f", "rawvideo", "-"], (chunk) => scanner.push(chunk));
  const scan = scanner.finish();
  writeFileSync(path.join(options.outDir, "frame-integrity.json"), `${JSON.stringify(scan, null, 2)}\n`);
  add("scanner de piscadas", scan.spikes.length === 0, scan.spikes.length === 0 ? `${scan.framesScanned} frames sem anomalia temporal` : `${scan.spikes.length} anomalia(s): frames ${scan.spikes.slice(0, 8).map((spike) => spike.frame).join(", ")} — inspecione em frame-integrity.json`);

  if (options.segments) {
    const drift: string[] = [];
    for (const segment of options.segments) {
      const mid = Math.floor(segment.durationFrames / 2);
      const expected = grayFrame(segment.file, mid, fps);
      const actual = grayFrame(video, segment.startFrame + mid, fps);
      let sum = 0;
      for (let index = 0; index < expected.length; index += 1) sum += Math.abs((expected[index] ?? 0) - (actual[index] ?? 0));
      if (sum / expected.length > 2) drift.push(`${segment.id} (${(sum / expected.length).toFixed(1)})`);
    }
    add("cada segmento no lugar", drift.length === 0, drift.length === 0 ? `${options.segments.length} segmentos batem com o vídeo montado` : `fora do lugar: ${drift.join(", ")}`);
  }

  if (options.cutFrames && options.cutFrames.length > 1) {
    // Folha de contato das fronteiras: frame antes, no corte e depois. É onde a piscada se esconde.
    const picks = options.cutFrames.slice(1).flatMap((cut) => [cut - 1, cut, cut + 1]);
    const sheet = path.join(options.outDir, "qa-fronteiras.jpg");
    const columns = 6;
    const rows = Math.ceil(picks.length / columns);
    const select = picks.map((frame) => `eq(n\\,${frame})`).join("+");
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vf", `select='${select}',scale=320:-2,tile=${columns}x${rows}:padding=4:color=black`, "-frames:v", "1", "-fps_mode", "vfr", sheet]);
    add("folha das fronteiras", true, `${picks.length} frames em ${sheet} — olhe antes de entregar`);
  }

  const report = { video, sha256: await sha256(video), checkedAt: new Date().toISOString(), checks, notCovered: ["estética e legibilidade", "sincronia de fala e imagem", "escuta: timbre, eco, pronúncia", "direitos de uso da mídia", "fadiga de repetição em trechos longos"] };
  writeFileSync(path.join(options.outDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return { ok: checks.every((check) => check.ok), checks, report };
}
