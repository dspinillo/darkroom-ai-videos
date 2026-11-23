import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { formatValue } from "../core/format.ts";
import type { Scene } from "../core/episode.ts";
import { scaleEmphasis, typedCharacterCount } from "../motion/primitives.ts";
import { Display, Label, Media, Rule, type SceneProps, enter, useEntrance, useUnit } from "./kit.tsx";

type Of<T extends Scene["type"]> = SceneProps & { scene: Extract<Scene, { type: T }> & { startFrame: number; durationFrames: number } };

function Frame({ props, children, align = "center" }: { props: SceneProps; children: ReactNode; align?: "center" | "end" }) {
  const { u } = useUnit();
  const { theme } = props;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg, color: theme.colors.ink, fontFamily: theme.fonts.body }}>
      <AbsoluteFill style={{ padding: `${80 * u}px ${110 * u}px`, justifyContent: align === "center" ? "center" : "flex-end", gap: 28 * u }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function HookScene(props: Of<"hook">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme, asset } = props;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg, color: theme.colors.ink, fontFamily: theme.fonts.body }}>
      {asset ? (
        <AbsoluteFill>
          <Media asset={asset} theme={theme} ordinal={props.ordinal} still={props.still} />
          <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 35%, #000c 100%)" }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ padding: `${80 * u}px ${110 * u}px`, justifyContent: asset ? "flex-end" : "center", gap: 26 * u }}>
        {scene.kicker ? <div style={enter("PUSH", at(0, 200))}><Label theme={theme} u={u}>{scene.kicker}</Label></div> : null}
        <div style={enter("PUSH", at(60, 220))}>
          <Display theme={theme} size={132 * u} style={{ maxWidth: 1550 * u }}>{scene.title}</Display>
        </div>
        <Rule theme={theme} u={u} progress={at(220, 200)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function StatementScene(props: Of<"statement">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Frame props={props}>
      <Rule theme={theme} u={u} progress={at(0, 200)} />
      <div style={enter("REVEAL", at(80, 260))}>
        <Display theme={theme} size={108 * u} style={{ maxWidth: 1600 * u }}>{scene.title}</Display>
      </div>
      {scene.subtitle ? (
        <div style={{ ...enter("PUSH", at(260, 200)), fontSize: 42 * u, color: theme.colors.muted, maxWidth: 1400 * u, lineHeight: 1.4 }}>{scene.subtitle}</div>
      ) : null}
    </Frame>
  );
}

export function StatScene(props: Of<"stat">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scene, theme } = props;
  const emphasis = props.still ? 1 : scaleEmphasis(frame, Math.round(0.36 * fps), fps);
  const value = formatValue(scene.value, scene.format, scene.baseline === undefined ? {} : { baseline: scene.baseline });
  return (
    <Frame props={props}>
      <div style={enter("PUSH", at(0, 200))}><Label theme={theme} u={u}>{scene.label}</Label></div>
      <div style={{ ...enter("REVEAL", at(80, 240)), display: "flex", alignItems: "baseline", gap: 24 * u }}>
        <div style={{ fontFamily: theme.fonts.mono, fontWeight: 600, fontSize: 260 * u, letterSpacing: "-0.05em", lineHeight: 1, transform: `scale(${emphasis})`, transformOrigin: "left bottom" }}>{value}</div>
        {scene.unit ? <div style={{ fontSize: 48 * u, color: theme.colors.muted }}>{scene.unit}</div> : null}
      </div>
      <div style={{ ...enter("PUSH", at(300, 200)), fontSize: 30 * u, color: theme.colors.muted }}>Fonte: {scene.source}</div>
    </Frame>
  );
}

export function QuoteScene(props: Of<"quote">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Frame props={props}>
      <div style={{ fontFamily: theme.fonts.display, fontSize: 200 * u, lineHeight: 0.6, color: theme.colors.accent, ...enter("PUSH", at(0, 180)) }}>“</div>
      <div style={enter("REVEAL", at(60, 280))}>
        <Display theme={theme} size={82 * u} style={{ maxWidth: 1550 * u, textTransform: "none", lineHeight: 1.15 }}>{scene.text}</Display>
      </div>
      <div style={{ ...enter("PUSH", at(320, 200)), display: "flex", gap: 18 * u, alignItems: "baseline", fontSize: 36 * u }}>
        <strong>{scene.author}</strong>
        {scene.role ? <span style={{ color: theme.colors.muted }}>{scene.role}</span> : null}
      </div>
    </Frame>
  );
}

export function ComparisonScene(props: Of<"comparison">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  const column = (pair: [string, string], delay: number, highlight: boolean) => (
    <div style={{ flex: 1, borderTop: `${4 * u}px solid ${highlight ? theme.colors.accent : theme.colors.line}`, paddingTop: 28 * u, ...enter("PUSH", at(delay, 220)) }}>
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 30 * u, letterSpacing: "0.1em", textTransform: "uppercase", color: theme.colors.muted }}>{pair[0]}</div>
      <Display theme={theme} size={140 * u} style={{ marginTop: 18 * u, color: highlight ? theme.colors.accent : theme.colors.ink }}>{pair[1]}</Display>
    </div>
  );
  return (
    <Frame props={props}>
      <div style={enter("PUSH", at(0, 200))}><Display theme={theme} size={80 * u}>{scene.title}</Display></div>
      <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: 80 * u, marginTop: 30 * u }}>
        {column(scene.left, 200, false)}
        {column(scene.right, 900, true)}
      </div>
    </Frame>
  );
}

export function StepsScene(props: Of<"steps">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  const current = scene.stage ?? scene.items.length - 1;
  return (
    <Frame props={props}>
      <div style={enter("PUSH", at(0, 200))}><Display theme={theme} size={80 * u}>{scene.title}</Display></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 * u, marginTop: 20 * u }}>
        {scene.items.map((item, index) => (
          <div key={item} style={{ display: "flex", gap: 30 * u, alignItems: "baseline", opacity: index <= current ? 1 : 0.28, ...enter("PUSH", at(220 + index * 260, 200)) }}>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 36 * u, color: index === current ? theme.colors.accent : theme.colors.muted }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: 54 * u, fontWeight: index === current ? 600 : 400 }}>{item}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function CodeScene(props: Of<"code">) {
  const { u } = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scene, theme } = props;
  const { durationInFrames } = useVideoConfig();
  // Todas as linhas digitadas até 60% da cena: código pela metade no corte não comunica nada.
  const perLine = Math.max(1, Math.min(Math.round(0.45 * fps), Math.floor((durationInFrames * 0.6) / scene.lines.length)));
  return (
    <Frame props={props}>
      {scene.title ? <Label theme={theme} u={u}>{scene.title}</Label> : null}
      <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.line}`, borderRadius: 10 * u, padding: `${44 * u}px ${52 * u}px`, fontFamily: theme.fonts.mono, fontSize: 44 * u, lineHeight: 1.6, whiteSpace: "pre" }}>
        {scene.lines.map((line, index) => {
          const shown = props.still ? line.length : typedCharacterCount(line, frame, index * perLine, fps);
          return (
            <div key={`${index}-${line}`} style={{ minHeight: "1.65em" }}>
              <span style={{ color: theme.colors.muted, marginRight: 30 * u }}>{String(index + 1).padStart(2, " ")}</span>
              {line.slice(0, shown)}
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

export function BrollScene(props: Of<"broll">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme, asset } = props;
  // A âncora do texto alterna pelo ordinal: o mesmo plano não sai igual duas vezes.
  const top = props.ordinal % 3 !== 0;
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      {asset ? <Media asset={asset} theme={theme} ordinal={props.ordinal} still={props.still} /> : null}
      {scene.caption ? (
        <AbsoluteFill style={{ padding: `${70 * u}px ${100 * u}px`, justifyContent: top ? "flex-start" : "flex-end" }}>
          <div style={{ ...enter("PUSH", at(120, 200)), alignSelf: "flex-start", background: "#000b", color: "#fff", padding: `${14 * u}px ${22 * u}px`, fontFamily: theme.fonts.body, fontSize: (portrait ? 46 : 40) * u, maxWidth: 1100 * u }}>
            {scene.caption}
          </div>
        </AbsoluteFill>
      ) : null}
      {asset ? <div style={{ position: "absolute", right: 24 * u, bottom: 16 * u, fontSize: 20 * u, color: "#fffa", fontFamily: theme.fonts.body, textShadow: "0 1px 3px #000" }}>{asset.credit}</div> : null}
    </AbsoluteFill>
  );
}

export function TakeawayScene(props: Of<"takeaway">) {
  const { u } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Frame props={props}>
      <div style={{ background: theme.colors.surface, borderLeft: `${6 * u}px solid ${theme.colors.accent}`, padding: `${56 * u}px ${64 * u}px`, display: "flex", flexDirection: "column", gap: 22 * u, ...enter("REVEAL", at(0, 260)) }}>
        {scene.label ? <Label theme={theme} u={u}>{scene.label}</Label> : null}
        <Display theme={theme} size={88 * u}>{scene.headline}</Display>
      </div>
    </Frame>
  );
}

export function CtaScene(props: Of<"cta">) {
  const { u } = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scene, theme } = props;
  const text = `> ${scene.text}`;
  const shown = props.still ? text.length : typedCharacterCount(text, frame, Math.round(0.2 * fps), fps);
  return (
    <Frame props={props}>
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 88 * u, color: theme.colors.ink }}>
        {text.slice(0, shown)}
        <span style={{ color: theme.colors.accent }}>▍</span>
      </div>
      <div style={{ fontSize: 34 * u, color: theme.colors.muted }}>{props.channelName}</div>
    </Frame>
  );
}
