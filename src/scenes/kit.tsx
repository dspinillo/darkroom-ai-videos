import type { CSSProperties, ReactNode } from "react";
import { Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Asset } from "../core/episode.ts";
import type { TimelineScene } from "../core/timeline.ts";
import { type MotionPrimitive, clamp01, entranceStyle, kenBurns, motionTokens, ruleWidth, sceneMotionVariant } from "../motion/primitives.ts";
import type { Theme } from "../theme/theme.ts";

/** Uma camada só existe no motor de stills: fundo (foto que a câmera move) e sobreposição (texto). */
export type Layer = "composite" | "background" | "overlay";

export interface SceneProps {
  scene: TimelineScene;
  asset: Asset | null;
  theme: Theme;
  channelName: string;
  /** Ordinal da cena: deriva a variação de enquadramento, de forma reprodutível. */
  ordinal: number;
  /** Motor de stills: tudo no estado final, sem câmera (o FFmpeg move a foto depois). */
  still: boolean;
  layer: Layer;
}

/** Escala de desenho: as medidas das cenas são pensadas em 1920 de largura (ou 1080 no 9:16). */
export function useUnit() {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return { u: portrait ? width / 1080 : width / 1920, portrait, width, height };
}

/** Progresso de uma entrada que começa `delayMs` depois do início da cena. */
export function useEntrance(still: boolean) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delayMs: number, durationMs: number) =>
    still ? 1 : clamp01((frame - (delayMs * fps) / 1000) / Math.max(1, (durationMs * fps) / 1000));
}

export function enter(primitive: MotionPrimitive, progress: number): CSSProperties {
  return entranceStyle(primitive, progress) as CSSProperties;
}

export function Display({ theme, size, children, style }: { theme: Theme; size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: theme.fonts.display,
        fontWeight: theme.display.weight,
        letterSpacing: `${theme.display.tracking}em`,
        textTransform: theme.display.uppercase ? "uppercase" : "none",
        fontSize: size,
        lineHeight: 1.04,
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Label({ theme, u, children, style }: { theme: Theme; u: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: theme.fonts.mono, fontSize: 30 * u, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.accent, ...style }}>
      {children}
    </div>
  );
}

export function Rule({ theme, u, progress }: { theme: Theme; u: number; progress: number }) {
  return <div style={{ height: 4 * u, width: ruleWidth(progress) * u, background: theme.colors.accent }} />;
}

/** Foto ou vídeo em tela cheia, com Ken Burns de assinatura própria por cena no motor ao vivo. */
export function Media({ asset, theme, ordinal, still, cropY = 50, contain = false }: { asset: Asset; theme: Theme; ordinal: number; still: boolean; cropY?: number; contain?: boolean }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fit: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: contain ? "contain" : "cover",
    objectPosition: `50% ${cropY}%`,
    filter: theme.photoFilter,
  };
  if (asset.kind === "video") {
    return <OffthreadVideo src={staticFile(asset.file)} muted startFrom={Math.round((asset.trimStart ?? 0) * fps)} style={fit} />;
  }
  const transform = still || contain ? undefined : kenBurns(frame / Math.max(1, durationInFrames - 1), sceneMotionVariant(ordinal));
  return <Img src={staticFile(asset.file)} style={{ ...fit, transform }} />;
}

export function TopBar({ theme, u, channelName, right, onPhoto }: { theme: Theme; u: number; channelName: string; right?: string; onPhoto: boolean }) {
  if (theme.chrome !== "documentary") return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 90 * u,
        right: 90 * u,
        top: 48 * u,
        display: "flex",
        justifyContent: "space-between",
        fontFamily: theme.fonts.body,
        fontSize: 20 * u,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: theme.colors.muted,
        textShadow: onPhoto ? "0 2px 7px #000" : undefined,
      }}
    >
      <span>{channelName}</span>
      {right ? <span>{right}</span> : null}
    </div>
  );
}

/** Crédito de toda mídia de terceiro. Procedência não é opcional, nem em vídeo pronto. */
export function CreditLine({ theme, u, text }: { theme: Theme; u: number; text?: string }) {
  if (!text) return null;
  return (
    <div style={{ position: "absolute", left: 90 * u, right: 90 * u, bottom: 30 * u, fontFamily: theme.fonts.body, fontSize: 18 * u, color: theme.colors.muted, textShadow: "0 1px 4px #000a" }}>
      {text}
    </div>
  );
}

export { motionTokens };
