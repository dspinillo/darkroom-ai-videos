import assert from "node:assert/strict";
import { test } from "node:test";
import { cubicOut, entranceStyle, sceneMotionVariant } from "../src/motion/primitives.ts";
import { FrameStreamScanner, findFrameSpikes } from "../src/qa/frame-spikes.ts";

const pixels = 16;
const frame = (value: number) => new Uint8Array(pixels).fill(value);
const join = (frames: Uint8Array[]) => Buffer.concat(frames);

test("piscada de um frame é detectada; corte persistente não", () => {
  const flash = join([frame(128), frame(128), frame(8), frame(125), frame(126)]);
  assert.deepEqual(findFrameSpikes(flash, pixels).map((spike) => spike.frame), [2]);
  const cut = join([frame(128), frame(128), frame(30), frame(30), frame(30)]);
  assert.equal(findFrameSpikes(cut, pixels).length, 0);
});

test("fade gradual não é piscada", () => {
  const fade = join(Array.from({ length: 30 }, (_, index) => frame(200 - index * 6)));
  assert.equal(findFrameSpikes(fade, pixels).length, 0);
});

test("scanner em fluxo acha a mesma piscada atravessando a fronteira do lote", () => {
  const frames = Array.from({ length: 40 }, () => frame(100));
  frames[11] = frame(0);
  const scanner = new FrameStreamScanner(pixels, 7);
  for (const item of frames) scanner.push(item);
  const result = scanner.finish();
  assert.equal(result.framesScanned, 40);
  assert.deepEqual(result.spikes.map((spike) => spike.frame), [11]);
});

test("PUSH e REVEAL não desenham o mesmo frame de entrada", () => {
  assert.notDeepEqual(entranceStyle("PUSH", 0.3), entranceStyle("REVEAL", 0.3));
  assert.deepEqual(entranceStyle("CUT", 0.3), {});
  assert.equal(cubicOut(1), 1);
  assert.ok(cubicOut(0.5) > 0.5);
});

test("cenas vizinhas não compartilham assinatura de movimento", () => {
  for (let ordinal = 0; ordinal < 40; ordinal += 1) {
    assert.notDeepEqual(sceneMotionVariant(ordinal), sceneMotionVariant(ordinal + 1));
  }
});
