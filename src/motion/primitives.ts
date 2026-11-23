export type MotionPrimitive = "CUT" | "PUSH" | "REVEAL" | "TYPE" | "SCALE_EMPHASIS" | "RULE_DRAW";

/**
 * Os números vêm do brand-kit (`docs/motion-system.md`). Ficam aqui como constantes porque o
 * renderer não pode reinterpretar decisão editorial: ele executa o que a marca já resolveu.
 */
export const motionTokens = {
  push: { distancePx: 24, durationMs: 200 },
  reveal: { durationMs: 240 },
  type: { charMs: 32, maxTotalMs: 900 },
  scaleEmphasis: { peak: 1.045, durationMs: 220 },
  ruleDraw: { durationMs: 200, widthPx: 96 },
} as const;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/** O único easing que o MOTION_SYSTEM aprova. Sem overshoot, sem elástico. */
export function cubicOut(progress: number): number {
  return 1 - (1 - clamp01(progress)) ** 3;
}

export interface EntranceStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
}

/**
 * A forma de cada primitivo na tela.
 *
 * Antes disto o renderer lia apenas `transition.durationFrames` e aplicava sempre o mesmo fade de
 * opacidade: `scene.transition.primitive` chegava resolvido pelo compilador e era descartado, então
 * REVEAL e PUSH produziam exatamente o mesmo frame. Cada primitivo agora tem geometria própria.
 */
export function entranceStyle(primitive: MotionPrimitive, progress: number): EntranceStyle {
  const eased = cubicOut(progress);
  switch (primitive) {
    case "CUT":
      // 0 ms por definição: o corte é a ausência de animação.
      return {};
    case "PUSH":
      return {
        opacity: eased,
        transform: `translateY(${((1 - eased) * motionTokens.push.distancePx).toFixed(2)}px)`,
      };
    case "REVEAL":
      // Máscara horizontal: o conteúdo é descoberto da esquerda, em contraste cheio, sem esmaecer.
      return { clipPath: `inset(0 ${((1 - eased) * 100).toFixed(2)}% 0 0)` };
    case "TYPE":
      // A digitação acontece por caractere; o contêiner apenas existe ou não.
      return { opacity: eased > 0 ? 1 : 0 };
    case "SCALE_EMPHASIS":
      return {
        transform: `scale(${(1 + (motionTokens.scaleEmphasis.peak - 1) * eased).toFixed(4)})`,
      };
    case "RULE_DRAW":
      return { clipPath: `inset(0 ${((1 - eased) * 100).toFixed(2)}% 0 0)` };
  }
}

/**
 * SCALE_EMPHASIS é ida e volta — 1,00 → pico → 1,00 — e vale só para o número ou a palavra que a
 * narração está sublinhando, nunca para a frase inteira.
 */
export function scaleEmphasis(frame: number, startFrame: number, fps: number): number {
  const total = Math.max(1, Math.round((motionTokens.scaleEmphasis.durationMs * fps) / 1_000));
  const elapsed = frame - startFrame;
  if (elapsed < 0 || elapsed > total) return 1;
  const half = total / 2;
  const progress = elapsed <= half ? elapsed / half : (total - elapsed) / half;
  return 1 + (motionTokens.scaleEmphasis.peak - 1) * cubicOut(progress);
}

/** Quantos caracteres de `text` já foram digitados, respeitando o teto de 900 ms do token. */
export function typedCharacterCount(text: string, frame: number, startFrame: number, fps: number) {
  const perCharacterFrames = Math.max(1, (motionTokens.type.charMs * fps) / 1_000);
  const capFrames = (motionTokens.type.maxTotalMs * fps) / 1_000;
  const elapsed = Math.min(Math.max(frame - startFrame, 0), capFrames);
  const revealed = Math.floor(elapsed / perCharacterFrames);
  const pace = Math.max(1, Math.ceil(text.length / Math.max(1, capFrames / perCharacterFrames)));
  return Math.min(text.length, revealed * pace);
}

/** RULE_DRAW: a régua de acento cresce da esquerda, nunca aparece por opacidade. */
export function ruleWidth(progress: number, width: number = motionTokens.ruleDraw.widthPx): number {
  return width * cubicOut(progress);
}

export interface SceneMotionVariant {
  panDirection: 1 | -1;
  panAmplitude: number;
  zoomAmount: number;
  textAnchor: "top" | "bottom";
}

/**
 * Variação determinística por ordinal. A repetição de um episódio real não vinha só de repetir asset: a
 * segunda aparição de um plano recebia o mesmo enquadramento e a mesma direção de pan da primeira,
 * porque a única variação era `(index + mediaIndex) % 2`. Aqui a assinatura de cada cena combina
 * direção, amplitude, zoom e âncora de texto, de forma que dois usos do mesmo asset dificilmente
 * coincidem — e o resultado continua reprodutível, porque só depende do ordinal.
 */
export function sceneMotionVariant(ordinal: number): SceneMotionVariant {
  return {
    panDirection: ordinal % 2 === 0 ? 1 : -1,
    panAmplitude: [2.5, 4, 1.5, 3.2][ordinal % 4] ?? 2.5,
    zoomAmount: [0.065, 0.03, 0.09, 0.045][ordinal % 4] ?? 0.065,
    textAnchor: ordinal % 3 === 0 ? "bottom" : "top",
  };
}

/** Ken Burns com a assinatura da cena, em vez de um único movimento repetido 80 vezes. */
export function kenBurns(progress: number, variant: SceneMotionVariant): string {
  const drift = variant.panDirection * (clamp01(progress) - 0.5) * variant.panAmplitude;
  const scale = 1.035 + clamp01(progress) * variant.zoomAmount;
  return `translateX(${drift.toFixed(3)}%) scale(${scale.toFixed(4)})`;
}
