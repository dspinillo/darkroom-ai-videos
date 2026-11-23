import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function run(command: string, args: string[], options: { maxBuffer?: number } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} não executou: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} falhou (${result.status}):\n${(result.stderr ?? "").slice(-3000)}`);
  return result;
}

export function hasCommand(command: string): boolean {
  return spawnSync(command, ["-version"], { encoding: "utf8" }).status === 0;
}

export interface VideoStream {
  codec_name: string;
  width: number;
  height: number;
  r_frame_rate: string;
  avg_frame_rate: string;
  time_base: string;
  nb_frames?: string;
}

export function probe(file: string) {
  const out = run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).stdout;
  const data = JSON.parse(out) as {
    streams: Array<VideoStream & { codec_type: string; sample_rate?: string; channels?: number }>;
    format: { duration: string };
  };
  return {
    video: data.streams.find((stream) => stream.codec_type === "video"),
    audio: data.streams.find((stream) => stream.codec_type === "audio"),
    duration: Number(data.format.duration),
  };
}

export function durationOf(file: string): number {
  return probe(file).duration;
}

/** Conta os pacotes de vídeo de verdade, sem confiar no cabeçalho. */
export function countVideoFrames(file: string): number {
  const out = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]).stdout;
  return Number.parseInt(out.trim(), 10);
}

export function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Roda o FFmpeg e entrega o stdout em pedaços — para varrer vídeo longo sem estourar memória. */
export function streamFfmpeg(args: string[], onChunk: (chunk: Buffer) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stdout.on("data", onChunk);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.slice(-2000)))));
  });
}

/** Mede loudness integrada e true peak com o loudnorm (primeira passada). */
export function measureLoudness(file: string): { integrated: number; truePeak: number; range: number } {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const match = (result.stderr ?? "").match(/\{\s*"input_i"[\s\S]*?\}/u);
  if (!match) throw new Error(`não consegui medir loudness de ${file}`);
  const stats = JSON.parse(match[0]) as { input_i: string; input_tp: string; input_lra: string };
  return { integrated: Number(stats.input_i), truePeak: Number(stats.input_tp), range: Number(stats.input_lra) };
}
