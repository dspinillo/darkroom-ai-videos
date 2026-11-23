import { type CharAlignment, tokenize } from "./alignment.ts";

/**
 * Casa as palavras que um alinhador (ou o Whisper) devolveu com as palavras do roteiro e produz um
 * alinhamento por caractere do texto exato do roteiro.
 *
 * O alinhador tira pontuação e pode ouvir "vá já" onde o texto diz "veja". Por isso o casamento é
 * tolerante: procura cada palavra do roteiro poucas posições à frente; a que não casar recebe tempo
 * interpolado entre as vizinhas. Se menos da metade casar, o resultado não é confiável e a função
 * devolve null — quem chamou cai para o tempo estimado e avisa.
 */

export interface SpokenWord {
  text: string;
  start: number;
  end: number;
}

const normalize = (word: string) =>
  word
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

export function matchSpokenWords(text: string, spoken: readonly SpokenWord[], durationSeconds: number): { alignment: CharAlignment; matched: number; total: number } | null {
  const tokens = tokenize(text);
  const times: Array<[number, number] | null> = tokens.map(() => null);
  let cursor = 0;
  for (const [index, token] of tokens.entries()) {
    const wanted = normalize(token);
    if (!wanted) continue;
    for (let look = cursor; look < Math.min(spoken.length, cursor + 4); look += 1) {
      const word = spoken[look];
      if (word && normalize(word.text) === wanted) {
        times[index] = [word.start, word.end];
        cursor = look + 1;
        break;
      }
    }
  }
  const matched = times.filter(Boolean).length;
  if (tokens.length === 0 || matched / tokens.length < 0.5) return null;

  // Interpola os buracos pelo número de caracteres entre as âncoras conhecidas.
  for (let index = 0; index < tokens.length; index += 1) {
    if (times[index]) continue;
    let left = index - 1;
    while (left >= 0 && !times[left]) left -= 1;
    let right = index + 1;
    while (right < tokens.length && !times[right]) right += 1;
    const from = left >= 0 ? (times[left] as [number, number])[1] : 0;
    const to = right < tokens.length ? (times[right] as [number, number])[0] : durationSeconds;
    const gap = tokens.slice(left + 1, right);
    const totalChars = gap.reduce((sum, token) => sum + token.length, 0) || 1;
    let at = from;
    for (const [offset, token] of gap.entries()) {
      const span = ((to - from) * token.length) / totalChars;
      times[left + 1 + offset] = [at, at + span];
      at += span;
    }
  }

  // Caractere a caractere: cada palavra ocupa o seu intervalo; o espaço ocupa a pausa entre elas.
  const characters = Array.from(text);
  const starts: number[] = [];
  const ends: number[] = [];
  let tokenIndex = -1;
  let inToken = false;
  let charInToken = 0;
  for (const character of characters) {
    if (/\s/u.test(character)) {
      inToken = false;
      const previous = times[tokenIndex]?.[1] ?? 0;
      const next = times[tokenIndex + 1]?.[0] ?? previous;
      starts.push(previous);
      ends.push(Math.max(previous, next));
      continue;
    }
    if (!inToken) {
      inToken = true;
      tokenIndex += 1;
      charInToken = 0;
    }
    const [start, end] = times[tokenIndex] ?? [0, 0];
    const length = Array.from(tokens[tokenIndex] ?? "x").length;
    const step = (end - start) / length;
    starts.push(start + charInToken * step);
    ends.push(start + (charInToken + 1) * step);
    charInToken += 1;
  }
  return { alignment: { characters, character_start_times_seconds: starts, character_end_times_seconds: ends }, matched, total: tokens.length };
}
