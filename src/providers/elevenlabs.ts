import type { CharAlignment } from "../core/alignment.ts";

/**
 * ElevenLabs `/with-timestamps`: áudio + tempo por caractere numa chamada só. Esse tempo por
 * caractere é o que alimenta legendas e âncoras de cena — não precisa de alinhador separado.
 *
 * A chave vem de ELEVENLABS_API_KEY e nunca é impressa. Uma chave por projeto: se a conta que
 * paga é outra, troque a variável, não o código.
 */
export async function synthesizeElevenLabs(options: {
  text: string;
  voiceId: string;
  model: string;
  settings?: Record<string, number | boolean> | undefined;
}): Promise<{ audio: Buffer; alignment: CharAlignment }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY não está definida (ver .env.example)");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ text: options.text, model_id: options.model, ...(options.settings ? { voice_settings: options.settings } : {}) }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`ElevenLabs respondeu HTTP ${response.status}: ${detail}`);
  }
  const body = (await response.json()) as { audio_base64?: string; alignment?: CharAlignment | null };
  if (!body.audio_base64 || !body.alignment) throw new Error("ElevenLabs não devolveu áudio com alinhamento");
  return { audio: Buffer.from(body.audio_base64, "base64"), alignment: body.alignment };
}
