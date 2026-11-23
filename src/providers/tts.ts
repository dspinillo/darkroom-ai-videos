import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CharAlignment, type TimedWord, estimateAlignment, tokenize, wordsFromAlignment } from "../core/alignment.ts";
import type { Episode } from "../core/episode.ts";
import { type SpokenWord, matchSpokenWords } from "../core/match.ts";
import { durationOf, measureLoudness, run } from "../render/ffmpeg.ts";
import { synthesizeElevenLabs } from "./elevenlabs.ts";

/**
 * Voz por bloco, com cache endereçado pelo conteúdo.
 *
 * Corrigir uma frase regenera um bloco, não o episódio: a narração inteira numa tomada só torna toda
 * correção uma nova rolagem de dado, e cada uma custa crédito. A chave do cache é o hash de
 * provedor + voz + modelo + ajustes + texto — mudar qualquer um deles gera de novo, e nada mais.
 */

export interface BlockVoice {
  blockId: string;
  hash: string;
  audio: string;
  seconds: number;
  estimated: boolean;
  cached: boolean;
}

export interface Narration {
  file: string;
  seconds: number;
  words: TimedWord[];
  blocks: BlockVoice[];
  estimated: boolean;
  paidCharacters: number;
}

type Voice = Episode["voice"];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function recordingOf(voice: Voice, dir: string, blockId: string): string {
  if (!voice.recordings) throw new Error('provedor gravacao precisa de voice.recordings, ex.: "voz/{block}.wav"');
  return path.resolve(dir, voice.recordings.replaceAll("{block}", blockId));
}

function blockHash(voice: Voice, text: string, dir: string, blockId: string): string {
  // Na gravação, o arquivo faz parte da identidade: regravou o bloco, o cache muda.
  let recording: string | undefined;
  if (voice.provider === "gravacao") {
    const file = recordingOf(voice, dir, blockId);
    const stat = existsSync(file) ? statSync(file) : null;
    recording = stat ? `${file}:${stat.size}:${Math.round(stat.mtimeMs)}` : `${file}:ausente`;
  }
  const identity = { provider: voice.provider, voiceId: voice.voiceId, model: voice.model, settings: voice.settings, sayVoice: voice.sayVoice, command: voice.command, endpoint: voice.endpoint, body: voice.body, polish: polishOf(voice), recording, align: voice.align, wpm: voice.provider === "silence" ? voice.wordsPerMinute : undefined, text };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

let alignerWarned = false;

/**
 * Tempo medido das palavras com o alinhador local (tools/align.py): Qwen3-ForcedAligner via mlx-audio
 * no Apple Silicon, ou faster-whisper em qualquer CPU. Sem alinhador instalado, estima e avisa.
 */
function measuredAlignment(voice: Voice, text: string, wav: string, log: (message: string) => void): { alignment: CharAlignment; estimated: boolean } {
  const duration = durationOf(wav);
  if (voice.align === "off") return { alignment: estimateAlignment(text, duration), estimated: true };
  const python = process.env.DARKROOM_PYTHON ?? "python3";
  const textFile = `${wav}.txt`;
  const out = `${wav}.align.json`;
  writeFileSync(textFile, text);
  const result = spawnSync(python, [path.join(root, "tools/align.py"), wav, textFile, out, "--language", voice.alignLanguage], { encoding: "utf8" });
  if (result.status === 0 && existsSync(out)) {
    const { backend, words } = JSON.parse(readFileSync(out, "utf8")) as { backend: string; words: SpokenWord[] };
    const matched = matchSpokenWords(text, words, duration);
    if (matched) {
      log(`  tempo medido por ${backend}: ${matched.matched}/${matched.total} palavras casadas com o roteiro`);
      return { alignment: matched.alignment, estimated: false };
    }
    log(`  aviso ${backend} não reconheceu metade das palavras do roteiro: tempo estimado neste bloco`);
  } else if (!alignerWarned) {
    alignerWarned = true;
    log(`  aviso sem alinhador local (${(result.stderr ?? "").trim().split("\n").at(-1) ?? "erro"}). Tempo estimado. Ver docs/voz.md → "Alinhador".`);
  }
  return { alignment: estimateAlignment(text, duration), estimated: true };
}

function toWav(input: string, wav: string) {
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ar", "48000", "-ac", "1", wav]);
}

function polishOf(voice: Voice): boolean {
  return voice.polish ?? ["gravacao", "local", "local-api"].includes(voice.provider);
}

/**
 * A cadeia de voz aprovada por escuta num dos canais: nivela a entrada em -20 LUFS (o limiar do
 * compressor depende do nível), corta grave de sala, tira embolado em 320 e 750 Hz e comprime 2:1.
 * Sem isso, a voz crua de TTS local ou de microfone tem pico alto demais para o master em -16 LUFS.
 */
function polishVoice(wav: string) {
  const measured = measureLoudness(wav);
  if (!Number.isFinite(measured.integrated) || measured.integrated < -60) return;
  const gain = (-20 - measured.integrated).toFixed(2);
  const raw = wav.replace(/\.wav$/u, "-cru.wav");
  renameSync(wav, raw);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", `volume=${gain}dB,highpass=f=65:p=2,equalizer=f=320:t=q:w=0.9:g=-2.5,equalizer=f=750:t=q:w=1.1:g=-1.5,acompressor=threshold=0.1:ratio=2:attack=15:release=140:knee=2.82843:makeup=1:detection=rms,alimiter=limit=0.47:level=false`, "-ar", "48000", "-ac", "1", wav]);
}

async function synthesize(voice: Voice, text: string, base: string, dir: string, blockId: string, log: (message: string) => void): Promise<{ alignment: CharAlignment; estimated: boolean }> {
  const wav = `${base}.wav`;
  if (voice.provider === "elevenlabs") {
    if (!voice.voiceId) throw new Error("voice.voiceId é obrigatório para o provedor elevenlabs");
    const result = await synthesizeElevenLabs({ text, voiceId: voice.voiceId, model: voice.model ?? "eleven_multilingual_v2", settings: voice.settings });
    writeFileSync(`${base}.mp3`, result.audio);
    toWav(`${base}.mp3`, wav);
    return { alignment: result.alignment, estimated: false };
  }
  if (voice.provider === "gravacao") {
    const file = recordingOf(voice, dir, blockId);
    if (!existsSync(file)) throw new Error(`gravação do bloco ${blockId} não encontrada: ${file}`);
    toWav(file, wav);
    return measuredAlignment(voice, text, wav, log);
  }
  if (voice.provider === "local-api") {
    if (!voice.endpoint) throw new Error("provedor local-api precisa de voice.endpoint (ex.: http://localhost:3900/v1/audio/speech)");
    const response = await fetch(voice.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: voice.model ?? "tts-1", voice: voice.voiceId, input: text, response_format: "wav", ...voice.body }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok) throw new Error(`${voice.endpoint} respondeu HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    writeFileSync(`${base}-api.wav`, Buffer.from(await response.arrayBuffer()));
    toWav(`${base}-api.wav`, wav);
    return measuredAlignment(voice, text, wav, log);
  }
  if (voice.provider === "local") {
    if (!voice.command) throw new Error("provedor local precisa de voice.command (ver docs/voz.md)");
    const work = `${base}-gerando`;
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const [program, ...args] = voice.command.map((part) => part.replaceAll("{text}", text).replaceAll("{dir}", work));
    run(program ?? "", args);
    const produced = readdirSync(work).filter((file) => /\.(wav|mp3|flac|m4a|aiff?)$/iu.test(file)).sort();
    if (produced.length !== 1) throw new Error(`o comando local deveria escrever um áudio em {dir}; escreveu ${produced.length}: ${produced.join(", ")}`);
    toWav(path.join(work, produced[0] ?? ""), wav);
    rmSync(work, { recursive: true, force: true });
    return measuredAlignment(voice, text, wav, log);
  }
  if (voice.provider === "say" && spawnSync("say", ["-v", "?"]).status === 0) {
    const aiff = `${base}.aiff`;
    run("say", ["-v", voice.sayVoice ?? "Luciana", "-o", aiff, text]);
    toWav(aiff, wav);
    return measuredAlignment(voice, text, wav, log);
  }
  if (voice.provider === "say") log("aviso `say` indisponível (não é macOS): este bloco sai como narração muda");
  const seconds = Math.max(1, (tokenize(text).length / voice.wordsPerMinute) * 60);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", seconds.toFixed(3), wav]);
  return { alignment: estimateAlignment(text, seconds), estimated: true };
}

/** Quanto custaria gerar agora: blocos fora do cache e seus caracteres. Não chama nada pago. */
export function voicePlan(episode: Episode, cacheDir: string, dir: string) {
  return episode.blocks.map((block) => {
    const hash = blockHash(episode.voice, block.text, dir, block.id);
    return { blockId: block.id, hash, characters: block.text.length, cached: existsSync(path.join(cacheDir, `${hash}.json`)) };
  });
}

export async function buildNarration(options: {
  episode: Episode;
  /** Pasta do episódio (gravações são relativas a ela). */
  dir: string;
  cacheDir: string;
  output: string;
  /** Provedor pago só roda com autorização explícita (`--live`). */
  allowPaid: boolean;
  log: (message: string) => void;
}): Promise<Narration> {
  const { episode, cacheDir } = options;
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(path.dirname(options.output), { recursive: true });
  const paid = episode.voice.provider === "elevenlabs";
  const plan = voicePlan(episode, cacheDir, options.dir);
  const missing = plan.filter((item) => !item.cached);
  const paidCharacters = paid ? missing.reduce((sum, item) => sum + item.characters, 0) : 0;
  if (paid && missing.length > 0 && !options.allowPaid) {
    throw new Error(
      `${missing.length} bloco(s) sem cache, ${paidCharacters} caracteres na ElevenLabs. ` +
        "Nada foi gerado. Rode de novo com --live para autorizar o gasto.",
    );
  }
  const blocks: BlockVoice[] = [];
  for (const [index, block] of episode.blocks.entries()) {
    const item = plan[index];
    if (!item) throw new Error("plano de voz incompleto");
    const base = path.join(cacheDir, item.hash);
    const meta = `${base}.json`;
    let estimated: boolean;
    if (existsSync(meta) && existsSync(`${base}.wav`)) {
      estimated = (JSON.parse(readFileSync(meta, "utf8")) as { estimated: boolean }).estimated;
    } else {
      options.log(`voz ${index + 1}/${episode.blocks.length}: ${block.id} (${episode.voice.provider}, ${block.text.length} caracteres)`);
      const result = await synthesize(episode.voice, block.text, base, options.dir, block.id, options.log);
      if (polishOf(episode.voice)) polishVoice(`${base}.wav`);
      estimated = result.estimated;
      writeFileSync(meta, JSON.stringify({ blockId: block.id, text: block.text, provider: episode.voice.provider, estimated, alignment: result.alignment }, null, 2));
    }
    blocks.push({ blockId: block.id, hash: item.hash, audio: `${base}.wav`, seconds: durationOf(`${base}.wav`), estimated, cached: item.cached });
  }

  // Monta a narração: blocos em ordem com o intervalo do episódio entre eles.
  const gap = episode.voice.gapSeconds;
  const words: TimedWord[] = [];
  let cursor = 0;
  const inputs: string[] = [];
  const filters: string[] = [];
  for (const [index, block] of blocks.entries()) {
    const text = episode.blocks[index]?.text ?? "";
    const { alignment } = JSON.parse(readFileSync(block.audio.replace(/\.wav$/u, ".json"), "utf8")) as { alignment: CharAlignment };
    words.push(...wordsFromAlignment(block.blockId, text, alignment, cursor));
    inputs.push("-i", block.audio);
    const pad = index < blocks.length - 1 ? `,apad=pad_dur=${gap}` : "";
    filters.push(`[${index}:a]aresample=48000,aformat=channel_layouts=mono${pad}[a${index}]`);
    cursor += block.seconds + (index < blocks.length - 1 ? gap : 0);
  }
  const graph = `${filters.join(";")};${blocks.map((_, index) => `[a${index}]`).join("")}concat=n=${blocks.length}:v=0:a=1[out]`;
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", options.output]);
  const seconds = durationOf(options.output);
  if (Math.abs(seconds - cursor) > 0.05) throw new Error(`narração montada tem ${seconds.toFixed(3)} s, esperado ${cursor.toFixed(3)} s`);
  return { file: options.output, seconds, words, blocks, estimated: blocks.some((block) => block.estimated), paidCharacters };
}
