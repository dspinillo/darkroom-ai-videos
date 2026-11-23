import assert from "node:assert/strict";
import { test } from "node:test";
import { AlignmentMismatchError, estimateAlignment, tokenize, wordsFromAlignment } from "../src/core/alignment.ts";
import { buildCaptions, toSrt } from "../src/core/captions.ts";
import { parseEpisode } from "../src/core/episode.ts";
import { formatValue } from "../src/core/format.ts";
import { auditTimeline, buildTimeline, planChunks, validateSceneCoverage } from "../src/core/timeline.ts";

test("tokenizar não perde nenhum caractere", () => {
  const text = "A manchete “a IA acabou com os empregos” não é sustentada — só 19% concordam (R$ 10,50).";
  assert.equal(tokenize(text).join(""), text.replace(/\s+/gu, ""));
  assert.ok(tokenize(text).includes("19%"));
  assert.ok(tokenize(text).includes("“a"));
});

test("palavras com tempo saem do alinhamento por caractere, com offset do bloco", () => {
  const text = "Olá, mundo 19%";
  const words = wordsFromAlignment("b1", text, estimateAlignment(text, 1.4), 10);
  assert.deepEqual(words.map((word) => word.text), ["Olá,", "mundo", "19%"]);
  assert.ok(Math.abs((words[0]?.start ?? 0) - 10) < 1e-9);
  assert.ok((words[2]?.end ?? 0) <= 11.4 + 1e-9);
});

test("alinhamento que não reproduz o roteiro é recusado, sem estimativa silenciosa", () => {
  const alignment = estimateAlignment("Olá mundo", 1);
  assert.throws(() => wordsFromAlignment("b1", "Olá, mundo", alignment), AlignmentMismatchError);
});

test("legenda quebra em pontuação e no máximo em duas linhas", () => {
  const text = "Primeiro ponto. Agora uma frase bem mais longa que precisa ser quebrada em duas linhas para caber na tela";
  const cues = buildCaptions(wordsFromAlignment("b1", text, estimateAlignment(text, 8)));
  assert.equal(cues[0]?.lines.join(" "), "Primeiro ponto.");
  for (const cue of cues) assert.ok(cue.lines.length <= 2);
  assert.ok(toSrt(cues).startsWith("1\n00:00:00,000 --> "));
});

test("percentual é absoluto; variação contra base leva sinal tipográfico", () => {
  assert.equal(formatValue(80, "percent"), "80%");
  assert.equal(formatValue(80, "index", { baseline: 100 }), "−20%");
  assert.equal(formatValue(110, "index", { baseline: 100 }), "+10%");
});

const baseEpisode = {
  id: "teste",
  title: "Teste",
  channelName: "Canal",
  voice: { provider: "silence" },
  blocks: [
    { id: "b1", text: "Um dois três quatro." },
    { id: "b2", text: "Cinco seis sete oito." },
  ],
  scenes: [
    { id: "s1", type: "hook", at: 0, title: "Gancho" },
    { id: "s2", type: "statement", at: { block: "b1", phrase: "três" }, title: "Três" },
    { id: "s3", type: "statement", at: { block: "b2" }, title: "Cinco" },
  ],
};

function wordsOf(episode: ReturnType<typeof parseEpisode>) {
  let cursor = 0;
  return episode.blocks.flatMap((block) => {
    const words = wordsFromAlignment(block.id, block.text, estimateAlignment(block.text, 2), cursor);
    cursor += 2.5;
    return words;
  });
}

test("cenas começam na frase falada e cobrem o vídeo sem buraco", () => {
  const episode = parseEpisode(baseEpisode);
  const timeline = buildTimeline(episode, wordsOf(episode), 4.5);
  assert.equal(timeline.scenes[0]?.startFrame, 0);
  assert.equal(timeline.scenes[2]?.startFrame, Math.round(2.5 * 30));
  assert.ok((timeline.scenes[1]?.startFrame ?? 0) > 0);
  validateSceneCoverage(timeline.scenes, timeline.totalFrames);
  assert.equal(timeline.totalFrames, Math.ceil((4.5 + 2) * 30));
});

test("frase inexistente e cena fora de ordem falham com mensagem clara", () => {
  const missing = parseEpisode({ ...baseEpisode, scenes: [baseEpisode.scenes[0], { id: "x", type: "statement", at: { block: "b1", phrase: "nove" }, title: "X" }] });
  assert.throws(() => buildTimeline(missing, wordsOf(missing), 4.5), /não aparece na fala/u);
  const reversed = parseEpisode({ ...baseEpisode, scenes: [baseEpisode.scenes[0], baseEpisode.scenes[2], baseEpisode.scenes[1]] });
  assert.throws(() => buildTimeline(reversed, wordsOf(reversed), 4.5), /ordem cronológica/u);
});

test("auditoria pega asset repetido cedo demais e arte com texto embutido", () => {
  const episode = parseEpisode({
    ...baseEpisode,
    assets: [
      { id: "foto", file: "a.jpg", kind: "image", credit: "c", license: "l" },
      { id: "capa", file: "b.jpg", kind: "image", credit: "c", license: "l", embeddedText: true },
    ],
    scenes: [
      { id: "s1", type: "hook", at: 0, title: "Gancho", asset: "capa" },
      { id: "s2", type: "broll", at: { block: "b1", phrase: "três" }, asset: "foto" },
      { id: "s3", type: "broll", at: { block: "b2" }, asset: "foto" },
    ],
  });
  const issues = auditTimeline(episode, buildTimeline(episode, wordsOf(episode), 4.5));
  assert.ok(issues.some((issue) => issue.scene === "s3" && /volta/u.test(issue.message)));
  assert.ok(issues.some((issue) => issue.scene === "s1" && /texto embutido/u.test(issue.message)));
});

test("blocos de render cobrem até o último frame", () => {
  const chunks = planChunks(16686, 1800);
  assert.deepEqual(chunks[0], [0, 1799]);
  assert.equal(chunks.at(-1)?.[1], 16685);
  assert.equal(chunks.reduce((sum, [start, end]) => sum + end - start + 1, 0), 16686);
});

test("episódio inválido lista cada problema com o caminho", () => {
  assert.throws(() => parseEpisode({ ...baseEpisode, scenes: [{ id: "s1", type: "stat", at: 0, value: 1, label: "x" }] }), /source/u);
  assert.throws(() => parseEpisode({ ...baseEpisode, scenes: [{ id: "s1", type: "broll", at: 0, asset: "nada" }] }), /asset desconhecido/u);
});

test("palavras do alinhador casam com o roteiro, com pontuação e palavra mal ouvida", async () => {
  const { matchSpokenWords } = await import("../src/core/match.ts");
  const text = "Ninguém percebeu. Só 19% concordam, veja.";
  const spoken = [
    { text: "Ninguém", start: 0, end: 0.4 },
    { text: "percebeu", start: 0.4, end: 1 },
    { text: "Só", start: 1.3, end: 1.5 },
    { text: "19", start: 1.5, end: 2 },
    { text: "concordam", start: 2, end: 2.6 },
    { text: "vá", start: 2.7, end: 2.9 },
  ];
  const result = matchSpokenWords(text, spoken, 3);
  assert.ok(result);
  const words = wordsFromAlignment("b1", text, result.alignment);
  assert.deepEqual(words.map((word) => word.text), tokenize(text));
  assert.equal(words[2]?.start, 1.3);
  assert.ok((words[5]?.start ?? 0) >= 2.6 && (words[5]?.end ?? 0) <= 3 + 1e-9, "palavra não reconhecida é interpolada no fim");
  assert.equal(matchSpokenWords(text, [{ text: "nada", start: 0, end: 1 }], 3), null);
});
