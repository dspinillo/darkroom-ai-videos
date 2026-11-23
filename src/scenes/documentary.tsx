import { AbsoluteFill, Img, staticFile } from "remotion";
import type { Scene } from "../core/episode.ts";
import { CreditLine, Display, Label, Media, type SceneProps, TopBar, enter, useEntrance, useUnit } from "./kit.tsx";

type Of<T extends Scene["type"]> = SceneProps & { scene: Extract<Scene, { type: T }> & { startFrame: number; durationFrames: number } };

function Ground({ props, onPhoto = false, children }: { props: SceneProps; onPhoto?: boolean; children: React.ReactNode }) {
  const { u } = useUnit();
  const { theme, layer } = props;
  const transparent = layer === "overlay";
  return (
    <AbsoluteFill style={{ background: transparent ? "transparent" : theme.colors.bg, color: theme.colors.ink, fontFamily: theme.fonts.body }}>
      {children}
      <TopBar theme={theme} u={u} channelName={props.channelName} onPhoto={onPhoto} />
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, bottom: 74 * u, height: 1, background: onPhoto ? "#ffffff40" : theme.colors.line }} />
      <CreditLine theme={theme} u={u} text={props.asset?.credit ?? "Gráfico editorial original · fontes nos créditos do episódio"} />
    </AbsoluteFill>
  );
}

/** Foto em tela cheia. No motor de stills vira duas camadas: a foto (que a câmera move) e o texto. */
export function PhotoScene(props: Of<"photo">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme, asset, layer } = props;
  if (!asset) return null;
  const photo = (
    <AbsoluteFill>
      <Media asset={asset} theme={theme} ordinal={props.ordinal} still={props.still} cropY={scene.cropY} />
    </AbsoluteFill>
  );
  if (layer === "background") return photo;
  return (
    <Ground props={props} onPhoto>
      {layer === "composite" ? photo : null}
      <AbsoluteFill
        style={{
          background: scene.hero
            ? "linear-gradient(180deg,rgba(5,15,17,.45),rgba(5,15,17,.1) 67%,rgba(5,15,17,.8))"
            : "linear-gradient(180deg,rgba(5,15,17,.6),transparent 30%,rgba(5,15,17,.22) 50%,rgba(5,15,17,.92))",
        }}
      />
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, ...(scene.hero ? { top: (portrait ? 300 : 170) * u } : { bottom: 120 * u }), display: "flex", flexDirection: "column", gap: 24 * u }}>
        {scene.eyebrow ? <div style={{ ...enter("PUSH", at(0, 200)), fontSize: 21 * u, letterSpacing: "0.2em", textTransform: "uppercase", color: scene.hero ? theme.colors.ink : theme.colors.accent }}>{scene.eyebrow}</div> : null}
        <div style={enter("PUSH", at(80, 220))}>
          <Display theme={theme} size={(scene.hero ? 128 : 96) * u} style={{ textShadow: "0 3px 14px #0008", maxWidth: 1650 * u }}>{scene.title}</Display>
        </div>
        {scene.subtitle ? <div style={{ ...enter("PUSH", at(240, 200)), fontSize: 38 * u, lineHeight: 1.4, maxWidth: 1450 * u, textShadow: "0 2px 8px #000" }}>{scene.subtitle}</div> : null}
      </div>
    </Ground>
  );
}

export function ArchiveScene(props: Of<"archive">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme, asset } = props;
  if (!asset) return null;
  return (
    <Ground props={props}>
      <div style={{ position: "absolute", inset: `${150 * u}px ${90 * u}px ${110 * u}px`, display: "flex", flexDirection: portrait ? "column" : "row", gap: 60 * u, alignItems: portrait ? "stretch" : "center" }}>
        <div style={{ flex: portrait ? "0 0 auto" : "0 0 36%", display: "flex", flexDirection: "column", gap: 28 * u, ...enter("PUSH", at(0, 220)) }}>
          <Label theme={theme} u={u}>O registro</Label>
          <Display theme={theme} size={86 * u}>{scene.title}</Display>
          {scene.subtitle ? <div style={{ fontSize: 34 * u, lineHeight: 1.5, color: theme.colors.muted }}>{scene.subtitle}</div> : null}
          {scene.sourceNote ? <div style={{ fontSize: 26 * u, lineHeight: 1.5, color: theme.colors.accent }}>{scene.sourceNote}</div> : null}
        </div>
        <div style={{ flex: 1, minHeight: 0, alignSelf: "stretch", background: "#080f0e", border: `1px solid ${theme.colors.line}`, boxShadow: "0 15px 55px #0005", display: "flex", ...enter("REVEAL", at(160, 280)) }}>
          <Img src={staticFile(asset.file)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
      </div>
    </Ground>
  );
}

export function ChronologyScene(props: Of<"chronology">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Ground props={props}>
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, top: 165 * u, display: "flex", flexDirection: "column", gap: 26 * u, ...enter("PUSH", at(0, 200)) }}>
        <Label theme={theme} u={u}>Linha do tempo</Label>
        <Display theme={theme} size={100 * u}>{scene.title}</Display>
      </div>
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, top: (portrait ? 620 : 560) * u, display: "flex", flexDirection: portrait ? "column" : "row", borderTop: portrait ? undefined : `2px solid ${theme.colors.line}`, gap: 34 * u }}>
        {scene.timeline.map(([year, label], index) => {
          const current = index === scene.stage;
          const visible = index <= scene.stage;
          return (
            <div key={year + label} style={{ position: "relative", flex: 1, paddingTop: 30 * u, opacity: visible ? 1 : 0.17, color: current ? theme.colors.ink : theme.colors.muted, ...(current ? enter("PUSH", at(260, 220)) : {}) }}>
              <div style={{ position: "absolute", top: -7 * u, left: 0, width: 12 * u, height: 12 * u, borderRadius: 6 * u, background: current ? theme.colors.accent : theme.colors.line }} />
              <Display theme={theme} size={(current ? 92 : 72) * u} style={{ color: current ? theme.colors.accent : theme.colors.muted }}>{visible ? year : "—"}</Display>
              <div style={{ fontSize: 32 * u, lineHeight: 1.35, marginTop: 16 * u }}>{visible ? label : ""}</div>
            </div>
          );
        })}
      </div>
    </Ground>
  );
}

export function CardsScene(props: Of<"cards">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Ground props={props}>
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, top: 170 * u, ...enter("PUSH", at(0, 200)) }}>
        <Display theme={theme} size={86 * u}>{scene.title}</Display>
      </div>
      <div style={{ position: "absolute", left: 90 * u, right: 90 * u, top: (portrait ? 480 : 420) * u, display: "flex", flexDirection: portrait ? "column" : "row", gap: 55 * u }}>
        {scene.items.map(([title, detail], index) => (
          <div key={title} style={{ flex: 1, minWidth: 0, ...enter("PUSH", at(200 + index * 240, 220)) }}>
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 19 * u, color: theme.colors.accent, letterSpacing: "0.15em" }}>{String(index + 1).padStart(2, "0")}</div>
            <Display theme={theme} size={(scene.items.length > 2 ? 64 : 82) * u} style={{ marginTop: 18 * u }}>{title}</Display>
            <div style={{ height: 2, background: theme.colors.accent, margin: `${20 * u}px 0 ${24 * u}px` }} />
            <div style={{ fontSize: 36 * u, lineHeight: 1.4, color: theme.colors.muted }}>{detail}</div>
          </div>
        ))}
      </div>
      {scene.subtitle ? <div style={{ position: "absolute", left: 90 * u, right: 90 * u, bottom: 120 * u, fontSize: 32 * u, color: theme.colors.muted }}>{scene.subtitle}</div> : null}
    </Ground>
  );
}

/** Resumo editorial de um documento. Diz que é resumo: não se passa por fac-símile. */
export function ReportScene(props: Of<"report">) {
  const { u, portrait } = useUnit();
  const at = useEntrance(props.still);
  const { scene, theme } = props;
  return (
    <Ground props={props}>
      <div style={{ position: "absolute", inset: `${160 * u}px ${90 * u}px ${110 * u}px`, display: "flex", flexDirection: portrait ? "column" : "row", gap: 70 * u }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30 * u, justifyContent: "center", ...enter("PUSH", at(0, 220)) }}>
          <Label theme={theme} u={u}>O documento</Label>
          <Display theme={theme} size={92 * u}>{scene.title}</Display>
          {scene.subtitle ? <div style={{ fontSize: 36 * u, lineHeight: 1.5, color: theme.colors.muted }}>{scene.subtitle}</div> : null}
        </div>
        <div style={{ flex: 1, position: "relative", background: theme.colors.paper, color: theme.colors.paperInk, padding: `${56 * u}px ${60 * u}px`, boxShadow: "0 14px 45px #0005", ...enter("REVEAL", at(180, 280)) }}>
          <div style={{ fontSize: 18 * u, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>{scene.reportAuthor ?? "Resumo da fonte"}</div>
          <Display theme={theme} size={56 * u} style={{ marginTop: 26 * u }}>{scene.reportTitle}</Display>
          {scene.date ? <div style={{ fontSize: 21 * u, marginTop: 20 * u }}>{scene.date}</div> : null}
          <div style={{ height: 2, background: "#8a9488", margin: `${26 * u}px 0 ${28 * u}px` }} />
          {scene.items.map(([label, value]) => (
            <div key={label} style={{ marginBottom: 30 * u }}>
              <div style={{ fontSize: 18 * u, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7, marginBottom: 10 * u }}>{label}</div>
              <div style={{ fontFamily: theme.fonts.display, fontSize: 42 * u, lineHeight: 1.14 }}>{value}</div>
            </div>
          ))}
          <div style={{ position: "absolute", left: 60 * u, right: 60 * u, bottom: 36 * u, fontSize: 16 * u, opacity: 0.7 }}>Resumo editorial. Não é fac-símile da página original.</div>
        </div>
      </div>
    </Ground>
  );
}
