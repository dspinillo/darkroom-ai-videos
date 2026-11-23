/**
 * Palavras com tempo, derivadas do alinhamento por caractere que o TTS devolve.
 *
 * O formato é o da ElevenLabs (`/with-timestamps`), mas qualquer provedor que entregue tempo por
 * caractere serve. A regra que importa: **a palavra é tudo entre espaços**. Um tokenizador por
 * regex de "letras e números" descartava em silêncio `%`, aspas e travessão — a legenda dizia `19`
 * no lugar de `19%`, e uma citação entre aspas virava afirmação. Separar por espaço não perde
 * nenhum caractere por construção, e o teste `tokenize-lossless` garante isso.
 */

export interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimedWord {
  text: string;
  start: number;
  end: number;
  blockId: string;
}

/** Divide o texto em palavras sem perder caractere nenhum. */
export function tokenize(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word.length > 0);
}

export class AlignmentMismatchError extends Error {
  constructor(blockId: string) {
    super(
      `O alinhamento do bloco "${blockId}" não reproduz o texto do roteiro. ` +
        "Regere a voz deste bloco ou corrija o texto: não existe tempo estimado aqui.",
    );
    this.name = "AlignmentMismatchError";
  }
}

/**
 * Converte o alinhamento de um bloco em palavras com tempo absoluto no episódio.
 * `offsetSeconds` é onde o bloco começa na narração montada.
 */
export function wordsFromAlignment(
  blockId: string,
  text: string,
  alignment: CharAlignment,
  offsetSeconds = 0,
): TimedWord[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } =
    alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) {
    throw new Error(`Alinhamento do bloco "${blockId}" tem listas de tamanhos diferentes.`);
  }
  if (characters.join("") !== text) throw new AlignmentMismatchError(blockId);

  const words: TimedWord[] = [];
  let current = "";
  let start = 0;
  let end = 0;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    if (/\s/u.test(character)) {
      if (current) words.push({ text: current, start, end, blockId });
      current = "";
      continue;
    }
    if (!current) start = (starts[index] ?? 0) + offsetSeconds;
    current += character;
    end = (ends[index] ?? 0) + offsetSeconds;
  }
  if (current) words.push({ text: current, start, end, blockId });
  return words;
}

/**
 * Alinhamento proporcional ao número de caracteres, para quando o provedor não devolve tempo
 * (voz do sistema, gravação humana sem alinhador). É **estimado**: serve para montar e revisar, e o
 * manifesto do render marca `timingEstimated: true`. Não use em entrega sem conferir no ouvido.
 */
export function estimateAlignment(text: string, durationSeconds: number): CharAlignment {
  const characters = Array.from(text);
  const step = durationSeconds / Math.max(1, characters.length);
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * step),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * step),
  };
}
