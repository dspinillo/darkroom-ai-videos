import { Composition } from "remotion";
import { MotionScene, type MotionProps } from "../motion/effects/MotionScene.tsx";
import { effects } from "../motion/effects/catalog.ts";
import { EpisodeComposition, type EpisodeProps, ShotComposition, type ShotProps } from "./Episode.tsx";

const placeholderEpisode: EpisodeProps = {
  timeline: {
    fps: 30,
    width: 1920,
    height: 1080,
    totalFrames: 90,
    narrationSeconds: 3,
    scenes: [{ id: "abertura", type: "hook", at: 0, title: "Rode `npm run demo` para ver um episódio", startFrame: 0, durationFrames: 90 }],
  },
  assets: [],
  channelName: "Seu canal",
  theme: "editorial",
  cues: [],
  burnCaptions: false,
  narration: null,
  music: null,
};

const placeholderShot: ShotProps = {
  scene: placeholderEpisode.timeline.scenes[0] as ShotProps["scene"],
  ordinal: 0,
  assets: [],
  channelName: "Seu canal",
  theme: "documentary",
  layer: "composite",
  width: 1920,
  height: 1080,
};

export function Root() {
  return (
    <>
      <Composition
        id="Episode"
        component={EpisodeComposition}
        defaultProps={placeholderEpisode}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={90}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.timeline.totalFrames,
          fps: props.timeline.fps,
          width: props.timeline.width,
          height: props.timeline.height,
        })}
      />
      <Composition
        id="Shot"
        component={ShotComposition}
        defaultProps={placeholderShot}
        fps={30}
        width={1920}
        height={1080}
        durationInFrames={1}
        calculateMetadata={({ props }) => ({ width: props.width, height: props.height })}
      />
      {effects.map((effect) => (
        <Composition
          key={effect.id}
          id={`effect-${effect.id}`}
          component={MotionScene}
          durationInFrames={120}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ effect: effect.id, text: effect.text, color: effect.color, bg: effect.bg, intensity: 1, value: effect.defaultValue ?? 87 } satisfies MotionProps}
        />
      ))}
    </>
  );
}
