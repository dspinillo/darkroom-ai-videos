import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionCue } from "../core/captions.ts";
import type { Asset } from "../core/episode.ts";
import type { Timeline, TimelineScene } from "../core/timeline.ts";
import { clamp01, cubicOut } from "../motion/primitives.ts";
import { type Layer, SceneView } from "../scenes/index.tsx";
import { type ThemeName, safeArea, themes } from "../theme/theme.ts";

export interface EpisodeProps {
  [key: string]: unknown;
  timeline: Timeline;
  assets: Asset[];
  channelName: string;
  theme: ThemeName;
  cues: CaptionCue[];
  burnCaptions: boolean;
  narration: string | null;
  music: { file: string; volumeDb: number } | null;
}

export interface ShotProps {
  [key: string]: unknown;
  scene: TimelineScene;
  ordinal: number;
  assets: Asset[];
  channelName: string;
  theme: ThemeName;
  layer: Layer;
  width: number;
  height: number;
}

/** Segura o render até as fontes chegarem: sem isso o primeiro frame sai com a fonte de fallback. */
export function useFontsReady() {
  const [handle] = useState(() => delayRender("fontes"));
  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle));
  }, [handle]);
}

function Captions({ cues, themeName }: { cues: CaptionCue[]; themeName: ThemeName }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const theme = themes[themeName];
  const area = safeArea(width, height);
  const u = area.portrait ? width / 1080 : width / 1920;
  const time = frame / fps;
  const cue = cues.find((item) => time >= item.start && time < item.end);
  const bandTop = area.portrait ? height - area.bottom - area.captionBand : height - area.captionBand;
  if (!cue) return null;
  const fade = cubicOut(clamp01(((time - cue.start) * 1000) / 140));
  return (
    <div
      style={{
        position: "absolute",
        left: area.x,
        right: area.x,
        top: bandTop,
        height: area.captionBand,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          opacity: fade,
          transform: `translateY(${(1 - fade) * 8}px)`,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
          fontSize: (area.portrait ? 52 : 44) * u,
          lineHeight: 1.22,
          color: "#ffffff",
          background: area.portrait ? "#000000b0" : "transparent",
          padding: area.portrait ? `${10 * u}px ${18 * u}px` : 0,
          textShadow: "0 2px 6px #000",
        }}
      >
        {cue.lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

/** Motor ao vivo: o episódio inteiro numa composição, com mídia em movimento e legenda queimada. */
export function EpisodeComposition(props: EpisodeProps) {
  useFontsReady();
  const { timeline, burnCaptions } = props;
  const theme = themes[props.theme];
  const area = safeArea(timeline.width, timeline.height);
  // A legenda tem faixa própria, fora da área das cenas: no 16:9 abaixo da imagem, no 9:16 logo
  // acima dos 320 px que a interface do YouTube cobre. Título de cena e legenda nunca se cruzam.
  const pictureHeight = !burnCaptions
    ? timeline.height
    : area.portrait
      ? timeline.height - area.bottom - area.captionBand
      : timeline.height - area.captionBand;
  const assets = new Map(props.assets.map((asset) => [asset.id, asset]));
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      {props.narration ? <Audio src={staticFile(props.narration)} /> : null}
      {props.music ? <Audio src={staticFile(props.music.file)} volume={10 ** (props.music.volumeDb / 20)} /> : null}
      <div style={{ position: "absolute", left: 0, top: 0, width: timeline.width, height: pictureHeight, overflow: "hidden" }}>
        {timeline.scenes.map((scene, ordinal) => (
          <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames} height={pictureHeight} name={`${scene.id} · ${scene.type}`}>
            <SceneView
              scene={scene}
              asset={scene.asset ? (assets.get(scene.asset) ?? null) : null}
              theme={theme}
              channelName={props.channelName}
              ordinal={ordinal}
              still={false}
              layer="composite"
            />
          </Sequence>
        ))}
      </div>
      {burnCaptions ? <Captions cues={props.cues} themeName={props.theme} /> : null}
    </AbsoluteFill>
  );
}

/** Motor de stills: um plano por vez, no estado final, em camadas separáveis. */
export function ShotComposition(props: ShotProps) {
  useFontsReady();
  const theme = themes[props.theme];
  const asset = props.scene.asset ? (props.assets.find((item) => item.id === props.scene.asset) ?? null) : null;
  return (
    <AbsoluteFill style={{ background: props.layer === "overlay" ? "transparent" : theme.colors.bg }}>
      <SceneView scene={props.scene} asset={asset} theme={theme} channelName={props.channelName} ordinal={props.ordinal} still layer={props.layer} />
    </AbsoluteFill>
  );
}
