import { z } from "zod";

/**
 * O contrato do episódio: um JSON que o operador (ou um agente) escreve, e que o framework valida
 * antes de gastar um centavo de voz ou um minuto de render.
 *
 * O que fica de fora de propósito: cor, fonte, tamanho, easing e coordenada. Isso é do tema
 * (src/theme). Quem escreve o episódio decide o que aparece, não como aparece.
 */

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, "use minúsculas, números e hífen");

const pair = z.tuple([z.string().min(1), z.string()]);

/** Onde a cena começa. Âncora na fala, nunca minutagem do storyboard. */
export const anchorSchema = z.union([
  z.number().nonnegative(),
  z.object({ block: id, phrase: z.string().min(1).optional() }).strict(),
]);

const base = {
  id,
  at: anchorSchema,
  asset: id.optional(),
  /** Afirmação (em `claims`) que esta cena mostra. Número na tela sem claim verificada não vai ao ar. */
  claim: id.optional(),
  note: z.string().optional(),
};

export const sceneSchema = z.discriminatedUnion("type", [
  // Editoriais (canal de análise, explicação)
  z.object({ ...base, type: z.literal("hook"), title: z.string().min(1), kicker: z.string().optional() }).strict(),
  z.object({ ...base, type: z.literal("statement"), title: z.string().min(1), subtitle: z.string().optional() }).strict(),
  z
    .object({
      ...base,
      type: z.literal("stat"),
      value: z.number(),
      format: z.enum(["number", "percent", "index"]).default("number"),
      baseline: z.number().optional(),
      unit: z.string().optional(),
      label: z.string().min(1),
      source: z.string().min(1),
    })
    .strict(),
  z.object({ ...base, type: z.literal("quote"), text: z.string().min(1), author: z.string().min(1), role: z.string().optional() }).strict(),
  z
    .object({
      ...base,
      type: z.literal("comparison"),
      title: z.string().min(1),
      left: pair,
      right: pair,
    })
    .strict(),
  z.object({ ...base, type: z.literal("steps"), title: z.string().min(1), items: z.array(z.string().min(1)).min(2).max(5), stage: z.number().int().nonnegative().optional() }).strict(),
  z.object({ ...base, type: z.literal("code"), title: z.string().optional(), lines: z.array(z.string()).min(1).max(14) }).strict(),
  z.object({ ...base, type: z.literal("broll"), asset: id, caption: z.string().optional() }).strict(),
  z.object({ ...base, type: z.literal("takeaway"), label: z.string().optional(), headline: z.string().min(1) }).strict(),
  z.object({ ...base, type: z.literal("cta"), text: z.string().min(1) }).strict(),
  // Documentais (minidoc, arquivo, história real)
  z
    .object({
      ...base,
      type: z.literal("photo"),
      asset: id,
      title: z.string().min(1),
      subtitle: z.string().optional(),
      eyebrow: z.string().optional(),
      hero: z.boolean().optional(),
      cropY: z.number().min(0).max(100).optional(),
      motion: z.enum(["push", "pull"]).optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("archive"),
      asset: id,
      title: z.string().min(1),
      subtitle: z.string().optional(),
      sourceNote: z.string().optional(),
    })
    .strict(),
  z.object({ ...base, type: z.literal("chronology"), title: z.string().min(1), timeline: z.array(pair).min(2).max(5), stage: z.number().int().nonnegative() }).strict(),
  z.object({ ...base, type: z.literal("cards"), title: z.string().min(1), items: z.array(pair).min(2).max(4), subtitle: z.string().optional() }).strict(),
  z
    .object({
      ...base,
      type: z.literal("report"),
      title: z.string().min(1),
      subtitle: z.string().optional(),
      reportTitle: z.string().min(1),
      reportAuthor: z.string().optional(),
      date: z.string().optional(),
      items: z.array(pair).min(1).max(4),
    })
    .strict(),
  // Qualquer um dos 48 efeitos da galeria, dentro do episódio
  z
    .object({
      ...base,
      type: z.literal("effect"),
      effect: z.string().min(1),
      text: z.string().min(1),
      value: z.number().optional(),
      color: z.string().optional(),
      bg: z.string().optional(),
    })
    .strict(),
]);
export type Scene = z.infer<typeof sceneSchema>;
export type SceneType = Scene["type"];

export const assetSchema = z
  .object({
    id,
    file: z.string().min(1),
    kind: z.enum(["image", "video"]),
    credit: z.string().min(1),
    license: z.string().min(1),
    source: z.string().optional(),
    /** Arte que já traz texto (thumbnail, cartaz). Não pode receber título por cima. */
    embeddedText: z.boolean().optional(),
    /** Reconstrução por IA ou ilustração. Nunca se passa por arquivo. */
    generated: z.boolean().optional(),
    trimStart: z.number().nonnegative().optional(),
  })
  .strict();
export type Asset = z.infer<typeof assetSchema>;

export const voiceSchema = z
  .object({
    /**
     * elevenlabs: pago, tempo medido. gravacao: sua voz, um arquivo por bloco. local: qualquer TTS
     * que rode por linha de comando (mlx-audio, VoiceStudio…). say: voz do macOS. silence: mudo.
     */
    provider: z.enum(["elevenlabs", "gravacao", "local", "local-api", "say", "silence"]),
    /** gravacao: caminho de cada bloco, relativo à pasta do episódio. Ex.: "voz/{block}.wav". */
    recordings: z.string().optional(),
    /**
     * local-api: endpoint de síntese compatível com a OpenAI (POST JSON → áudio). Serve para o
     * VoiceStudio (http://localhost:3900/v1/audio/speech) e o mlx_audio.server.
     */
    endpoint: z.string().url().optional(),
    /** local-api: campos extras no corpo da requisição (ex.: { "language": "pt" }). */
    body: z.record(z.string(), z.unknown()).optional(),
    /**
     * Tratamento da voz antes da mistura: ganho até -20 LUFS + passa-alta + EQ + compressor (a cadeia
     * aprovada num dos canais). Padrão: ligado para gravacao, local e local-api.
     */
    polish: z.boolean().optional(),
    /** local: comando que escreve um arquivo de áudio em {dir}. Placeholders: {text}, {dir}. */
    command: z.array(z.string()).min(1).optional(),
    /** Mede o tempo de cada palavra com alinhador local (tools/align.py). Sem alinhador, estima. */
    align: z.enum(["auto", "off"]).default("auto"),
    /** Idioma da fala para o alinhador (nome em inglês: Portuguese, English, Spanish). */
    alignLanguage: z.string().default("Portuguese"),
    voiceId: z.string().optional(),
    model: z.string().optional(),
    settings: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
    /** Voz do macOS para o provedor `say` (ex.: Luciana). */
    sayVoice: z.string().optional(),
    /** Palavras por minuto do provedor `silence`, que só estima. */
    wordsPerMinute: z.number().positive().default(150),
    /** Silêncio entre blocos na narração montada. */
    gapSeconds: z.number().nonnegative().default(0.4),
  })
  .strict();

export const episodeSchema = z
  .object({
    id,
    title: z.string().min(1),
    channelName: z.string().min(1),
    language: z.string().default("pt-BR"),
    format: z.enum(["landscape", "portrait"]).default("landscape"),
    fps: z.number().int().positive().default(30),
    theme: z.enum(["editorial", "documentary"]).default("editorial"),
    engine: z.enum(["live", "stills"]).default("live"),
    captions: z.enum(["burn", "sidecar"]).optional(),
    tailSeconds: z.number().nonnegative().default(2),
    voice: voiceSchema,
    blocks: z.array(z.object({ id, text: z.string().min(1) }).strict()).min(1),
    scenes: z.array(sceneSchema).min(1),
    assets: z.array(assetSchema).default([]),
    /** Fontes consultadas. Cada afirmação aponta para uma ou mais. */
    sources: z
      .array(z.object({ id, title: z.string().min(1), url: z.string().min(1), accessed: z.string().optional(), note: z.string().optional() }).strict())
      .default([]),
    /**
     * Afirmações factuais do roteiro. Rascunho gerado por IA sai com tudo `pendente`; alguém confere
     * na fonte e muda para `verificada`. O render recusa episódio com afirmação pendente.
     */
    claims: z
      .array(z.object({ id, text: z.string().min(1), sources: z.array(id).min(1), status: z.enum(["pendente", "verificada", "descartada"]) }).strict())
      .default([]),
    music: z
      .object({ file: z.string().min(1), volumeDb: z.number().max(0).default(-24), credit: z.string().min(1), license: z.string().min(1) })
      .strict()
      .optional(),
    rules: z
      .object({
        minAssetGapSeconds: z.number().nonnegative().default(60),
        maxStaticSeconds: z.number().positive().default(8),
      })
      .strict()
      .default({ minAssetGapSeconds: 60, maxStaticSeconds: 8 }),
  })
  .strict()
  .superRefine((episode, context) => {
    const unique = (values: string[], label: string) => {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) context.addIssue({ code: "custom", message: `${label} repetido: ${value}` });
        seen.add(value);
      }
    };
    unique(episode.blocks.map((block) => block.id), "id de bloco");
    unique(episode.scenes.map((scene) => scene.id), "id de cena");
    unique(episode.assets.map((asset) => asset.id), "id de asset");
    unique(episode.sources.map((source) => source.id), "id de fonte");
    unique(episode.claims.map((claim) => claim.id), "id de afirmação");
    const sourceIds = new Set(episode.sources.map((source) => source.id));
    for (const claim of episode.claims) {
      for (const source of claim.sources) {
        if (!sourceIds.has(source)) context.addIssue({ code: "custom", message: `afirmação ${claim.id}: fonte desconhecida ${source}` });
      }
    }
    const claimIds = new Set(episode.claims.map((claim) => claim.id));
    for (const scene of episode.scenes) {
      if (scene.claim && !claimIds.has(scene.claim)) context.addIssue({ code: "custom", message: `cena ${scene.id}: afirmação desconhecida ${scene.claim}` });
    }
    const assets = new Set(episode.assets.map((asset) => asset.id));
    const blocks = new Set(episode.blocks.map((block) => block.id));
    for (const scene of episode.scenes) {
      if (scene.asset && !assets.has(scene.asset)) {
        context.addIssue({ code: "custom", message: `cena ${scene.id}: asset desconhecido ${scene.asset}` });
      }
      if (typeof scene.at === "object" && !blocks.has(scene.at.block)) {
        context.addIssue({ code: "custom", message: `cena ${scene.id}: bloco desconhecido ${scene.at.block}` });
      }
    }
  });
export type Episode = z.infer<typeof episodeSchema>;
export type EpisodeInput = z.input<typeof episodeSchema>;

export function parseEpisode(value: unknown): Episode {
  const result = episodeSchema.safeParse(value);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  · ${issue.path.join(".") || "episódio"}: ${issue.message}`);
    throw new Error(`Episódio inválido:\n${lines.join("\n")}`);
  }
  return result.data;
}
