import type { TimedWord } from "./alignment.ts";

/**
 * Legenda editorial, não karaokê: por frase, no máximo duas linhas, quebra em pontuação ou em
 * pausa real da fala. Palavra pulando na tela foi testado e recusado (ver docs/motion-system.md).
 */

export interface CaptionCue {
  start: number;
  end: number;
  lines: string[];
}

export interface CaptionPolicy {
  /** Palavras por legenda antes de forçar a quebra. */
  maxWordsPerCue: number;
  /** Palavras por linha; a legenda tem no máximo duas linhas. */
  maxWordsPerLine: number;
  /** Silêncio entre palavras que conta como fim de frase, em segundos. */
  pauseSeconds: number;
  /** Tempo mínimo de tela, para a leitura não piscar. */
  minDurationSeconds: number;
}

export const defaultCaptionPolicy: CaptionPolicy = {
  maxWordsPerCue: 10,
  maxWordsPerLine: 6,
  pauseSeconds: 0.35,
  minDurationSeconds: 0.8,
};

const phraseEnd = /[.,!?;:…]["”’)»]*$/u;

function splitLines(words: string[], perLine: number): string[] {
  if (words.length <= perLine) return [words.join(" ")];
  // Duas linhas equilibradas: a primeira um pouco maior, como na leitura.
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

export function buildCaptions(
  words: readonly TimedWord[],
  policy: CaptionPolicy = defaultCaptionPolicy,
): CaptionCue[] {
  const maxWords = Math.min(policy.maxWordsPerCue, policy.maxWordsPerLine * 2);
  const cues: CaptionCue[] = [];
  let group: TimedWord[] = [];
  const flush = () => {
    const first = group[0];
    const last = group.at(-1);
    if (first && last) {
      cues.push({
        start: first.start,
        end: last.end,
        lines: splitLines(
          group.map((word) => word.text),
          policy.maxWordsPerLine,
        ),
      });
    }
    group = [];
  };
  for (const [index, word] of words.entries()) {
    group.push(word);
    const next = words[index + 1];
    const pause = next !== undefined && next.start - word.end >= policy.pauseSeconds;
    const blockChange = next !== undefined && next.blockId !== word.blockId;
    if (phraseEnd.test(word.text) || pause || blockChange || group.length >= maxWords) flush();
  }
  flush();

  // Estende cues curtas até o mínimo de leitura sem invadir a próxima.
  for (const [index, cue] of cues.entries()) {
    const next = cues[index + 1];
    const wanted = cue.start + policy.minDurationSeconds;
    if (cue.end < wanted) cue.end = next ? Math.min(wanted, next.start) : wanted;
  }
  return cues;
}

function timestamp(seconds: number, separator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(
    totalSeconds % 60,
  )}${separator}${pad(ms, 3)}`;
}

export function toSrt(cues: readonly CaptionCue[]): string {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start, ",")} --> ${timestamp(cue.end, ",")}\n${cue.lines.join("\n")}`,
    )
    .join("\n\n")}\n`;
}

export function toVtt(cues: readonly CaptionCue[]): string {
  return `WEBVTT\n\n${cues
    .map(
      (cue) => `${timestamp(cue.start, ".")} --> ${timestamp(cue.end, ".")}\n${cue.lines.join("\n")}`,
    )
    .join("\n\n")}\n`;
}
