import type { TimedWord } from "./alignment.ts";
import type { Asset, Episode, Scene } from "./episode.ts";

/**
 * Do episódio + palavras com tempo → cenas com frame de início e duração.
 *
 * Os tempos vêm da fala. Num episódio real, o storyboard estimou "07:20, cinco saídas" e a
 * narração chegou ao "Primeiro…" 1 min 20 s antes: a tela mostrava outra coisa enquanto a voz
 * contava. Âncora na frase falada elimina essa classe de erro.
 */

export type TimelineScene = Scene & { startFrame: number; durationFrames: number };

export interface Timeline {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  narrationSeconds: number;
  scenes: TimelineScene[];
}

export interface Issue {
  level: "error" | "warning";
  scene?: string;
  message: string;
}

const normalize = (word: string) =>
  word
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, "");

export function canvasOf(format: Episode["format"]): { width: number; height: number } {
  return format === "portrait" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/** Segundo em que a cena começa, ou erro dizendo exatamente qual âncora não existe. */
export function resolveAnchor(scene: Scene, words: readonly TimedWord[]): number {
  if (typeof scene.at === "number") return scene.at;
  const { block, phrase } = scene.at;
  const inBlock = words.filter((word) => word.blockId === block);
  if (inBlock.length === 0) throw new Error(`cena ${scene.id}: o bloco ${block} não tem palavras alinhadas`);
  if (!phrase) return inBlock[0]?.start ?? 0;
  const wanted = phrase.split(/\s+/u).map(normalize).filter(Boolean);
  for (let index = 0; index + wanted.length <= inBlock.length; index += 1) {
    if (wanted.every((word, offset) => normalize(inBlock[index + offset]?.text ?? "") === word)) {
      return inBlock[index]?.start ?? 0;
    }
  }
  throw new Error(`cena ${scene.id}: a frase "${phrase}" não aparece na fala do bloco ${block}`);
}

export function buildTimeline(episode: Episode, words: readonly TimedWord[], narrationSeconds: number): Timeline {
  const { fps } = episode;
  const totalFrames = Math.ceil((narrationSeconds + episode.tailSeconds) * fps);
  const starts = episode.scenes.map((scene, index) => {
    // O gancho começa no primeiro frame, sempre.
    const seconds = index === 0 ? 0 : resolveAnchor(scene, words);
    return Math.round(seconds * fps);
  });
  for (let index = 1; index < starts.length; index += 1) {
    if ((starts[index] ?? 0) <= (starts[index - 1] ?? 0)) {
      throw new Error(
        `cena ${episode.scenes[index]?.id} começa antes ou junto da anterior (${episode.scenes[index - 1]?.id}). ` +
          "As cenas precisam estar em ordem cronológica da fala.",
      );
    }
  }
  if ((starts.at(-1) ?? 0) >= totalFrames) throw new Error("a última cena começa depois do fim da narração");
  const scenes = episode.scenes.map((scene, index) => {
    const startFrame = starts[index] ?? 0;
    const next = starts[index + 1] ?? totalFrames;
    return { ...scene, startFrame, durationFrames: next - startFrame };
  });
  const timeline = { fps, ...canvasOf(episode.format), totalFrames, narrationSeconds, scenes };
  validateSceneCoverage(timeline.scenes, totalFrames);
  return timeline;
}

/** Sem buraco, sem sobreposição, e a soma bate com a duração. */
export function validateSceneCoverage(
  scenes: readonly { startFrame: number; durationFrames: number }[],
  totalFrames: number,
): void {
  let cursor = 0;
  for (const scene of scenes) {
    if (scene.startFrame !== cursor || !Number.isInteger(scene.durationFrames) || scene.durationFrames < 1) {
      throw new Error(`cobertura de cenas quebrada no frame ${cursor}`);
    }
    cursor += scene.durationFrames;
  }
  if (cursor !== totalFrames) throw new Error(`as cenas cobrem ${cursor} frames de ${totalFrames}`);
}

const textScenes = new Set<Scene["type"]>(["hook", "statement", "photo", "archive", "takeaway", "cta"]);
const motionScenes = new Set<Scene["type"]>(["broll", "photo", "effect", "steps", "chronology", "code", "stat"]);

/**
 * As travas editoriais que nenhum teste de unidade pega, mas que já estragaram episódio:
 * repetição de mídia, arte com texto recebendo título por cima, plano parado tempo demais.
 */
const evidenceScenes = new Set<Scene["type"]>(["stat", "report", "comparison", "chronology", "quote"]);

export function auditTimeline(episode: Episode, timeline: Timeline): Issue[] {
  const issues: Issue[] = [];
  const claims = new Map(episode.claims.map((claim) => [claim.id, claim]));
  for (const claim of episode.claims) {
    if (claim.status === "pendente") issues.push({ level: "error", message: `afirmação ${claim.id} ainda pendente: confira na fonte e marque "verificada" (ou "descartada" e tire do roteiro) — "${claim.text.slice(0, 80)}"` });
  }
  for (const scene of episode.scenes) {
    const claim = scene.claim ? claims.get(scene.claim) : undefined;
    if (claim?.status === "descartada") issues.push({ level: "error", scene: scene.id, message: `mostra a afirmação ${claim.id}, que foi descartada` });
    if (episode.claims.length > 0 && evidenceScenes.has(scene.type) && !scene.claim) {
      issues.push({ level: "warning", scene: scene.id, message: `cena ${scene.type} sem "claim": de onde vem esse dado?` });
    }
  }
  const assets = new Map<string, Asset>(episode.assets.map((asset) => [asset.id, asset]));
  const lastSeen = new Map<string, number>();
  for (const scene of timeline.scenes) {
    const seconds = scene.startFrame / timeline.fps;
    const duration = scene.durationFrames / timeline.fps;
    if (scene.asset) {
      const previous = lastSeen.get(scene.asset);
      if (previous !== undefined && seconds - previous < episode.rules.minAssetGapSeconds) {
        issues.push({
          level: "error",
          scene: scene.id,
          message: `o asset ${scene.asset} volta ${(seconds - previous).toFixed(1)} s depois do último uso (mínimo ${episode.rules.minAssetGapSeconds} s)`,
        });
      }
      lastSeen.set(scene.asset, seconds + duration);
      const asset = assets.get(scene.asset);
      if (asset?.embeddedText && textScenes.has(scene.type)) {
        issues.push({
          level: "error",
          scene: scene.id,
          message: `o asset ${asset.id} já tem texto embutido e a cena ${scene.type} desenha título por cima; use a versão limpa da arte`,
        });
      }
    }
    if (!motionScenes.has(scene.type) && duration > episode.rules.maxStaticSeconds) {
      issues.push({
        level: "warning",
        scene: scene.id,
        message: `${duration.toFixed(1)} s de cena ${scene.type}; acima de ${episode.rules.maxStaticSeconds} s o plano parece parado`,
      });
    }
  }
  return issues;
}

/** Blocos de render que cobrem o vídeo inteiro, derivados do total — nunca de outra constante. */
export function planChunks(totalFrames: number, chunkFrames = 1800): Array<[number, number]> {
  const chunks: Array<[number, number]> = [];
  for (let start = 0; start < totalFrames; start += chunkFrames) {
    chunks.push([start, Math.min(start + chunkFrames, totalFrames) - 1]);
  }
  return chunks;
}
