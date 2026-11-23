import type { ComponentType } from "react";
import { AbsoluteFill, Freeze, Sequence, useVideoConfig } from "remotion";
import type { SceneType } from "../core/episode.ts";
import { MotionScene } from "../motion/effects/MotionScene.tsx";
import { effects, type EffectId } from "../motion/effects/catalog.ts";
import { ArchiveScene, CardsScene, ChronologyScene, PhotoScene, ReportScene } from "./documentary.tsx";
import { BrollScene, CodeScene, ComparisonScene, CtaScene, HookScene, QuoteScene, StatementScene, StatScene, StepsScene, TakeawayScene } from "./editorial.tsx";
import type { SceneProps } from "./kit.tsx";

/** Um efeito da galeria dentro do episódio. Roda uma vez (até 5 s) e para no estado final legível. */
function EffectScene(props: SceneProps) {
  const { fps } = useVideoConfig();
  const scene = props.scene as Extract<SceneProps["scene"], { type: "effect" }>;
  const meta = effects.find((effect) => effect.id === scene.effect);
  if (!meta) throw new Error(`efeito desconhecido: ${scene.effect}`);
  const length = props.still ? 120 : Math.min(scene.durationFrames, 5 * fps);
  const body = (
    <MotionScene
      effect={meta.id as EffectId}
      text={scene.text}
      color={scene.color ?? props.theme.colors.ink}
      bg={scene.bg ?? props.theme.colors.bg}
      intensity={1}
      value={scene.value ?? meta.defaultValue ?? 87}
    />
  );
  return (
    <AbsoluteFill>
      <Freeze frame={length - 1} active={(frame) => props.still || frame >= length}>
        <Sequence durationInFrames={length}>{body}</Sequence>
      </Freeze>
    </AbsoluteFill>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: cada cena estreita o próprio tipo
export const sceneComponents: Record<SceneType, ComponentType<any>> = {
  hook: HookScene,
  statement: StatementScene,
  stat: StatScene,
  quote: QuoteScene,
  comparison: ComparisonScene,
  steps: StepsScene,
  code: CodeScene,
  broll: BrollScene,
  takeaway: TakeawayScene,
  cta: CtaScene,
  photo: PhotoScene,
  archive: ArchiveScene,
  chronology: ChronologyScene,
  cards: CardsScene,
  report: ReportScene,
  effect: EffectScene,
};

export function SceneView(props: SceneProps) {
  const Component = sceneComponents[props.scene.type];
  return <Component {...props} />;
}

export type { Layer, SceneProps } from "./kit.tsx";
