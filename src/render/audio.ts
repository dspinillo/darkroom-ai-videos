import { measureLoudness, run } from "./ffmpeg.ts";

export interface MasterTarget {
  /** LUFS integrado. -16 é o que os dois canais entregaram; o YouTube normaliza perto de -14. */
  integrated: number;
  truePeak: number;
}

export const defaultTarget: MasterTarget = { integrated: -16, truePeak: -1.5 };

/**
 * Narração + trilha → master WAV, com **ganho constante** até o alvo.
 *
 * Ganho constante e não loudnorm dinâmico: o loudnorm em passada única comprime a dinâmica da voz
 * de forma diferente ao longo do episódio. Se a mistura precisar de mais que um ganho para caber
 * no alvo sem estourar o pico, o erro é da mistura — e a função recusa em vez de esconder.
 */
export function buildMasterAudio(options: {
  narration: string;
  music?: { file: string; volumeDb: number } | undefined;
  totalSeconds: number;
  output: string;
  target?: MasterTarget;
}) {
  const target = options.target ?? defaultTarget;
  const mix = options.output.replace(/\.wav$/u, "-mix.wav");
  const total = options.totalSeconds.toFixed(3);
  // Refeita sempre: é barata, e uma mistura velha em disco já escondeu uma voz nova.
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", options.narration];
  let graph = `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad[voice];[voice]atrim=0:${total}[mix]`;
  if (options.music) {
    args.push("-stream_loop", "-1", "-i", options.music.file);
    const fadeOut = Math.max(0, options.totalSeconds - 3).toFixed(3);
    graph =
      `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad[voice];` +
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${options.music.volumeDb}dB,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=3[bed];` +
      `[voice][bed]amix=inputs=2:normalize=0:duration=longest,atrim=0:${total}[mix]`;
  }
  run("ffmpeg", [...args, "-filter_complex", graph, "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s24le", "-t", total, mix]);
  const measured = measureLoudness(mix);
  if (!Number.isFinite(measured.integrated) || measured.integrated < -60) {
    // Narração muda (provedor `silence`): não há o que normalizar.
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mix, "-c:a", "pcm_s24le", options.output]);
    return { measured, gainDb: 0, target, silent: true };
  }
  const gain = Math.min(target.integrated - measured.integrated, target.truePeak - measured.truePeak);
  const reachable = measured.integrated + gain;
  if (Math.abs(reachable - target.integrated) > 1) {
    throw new Error(
      `a mistura mede ${measured.integrated} LUFS / ${measured.truePeak} dBTP; com ganho constante só chega a ${reachable.toFixed(2)} LUFS sem estourar o pico. ` +
        "Trate a voz antes (voice.polish: true; ver docs/voz.md) em vez de forçar o alvo.",
    );
  }
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mix, "-af", `volume=${gain.toFixed(2)}dB`, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", options.output]);
  return { measured, gainDb: Number(gain.toFixed(2)), target };
}
