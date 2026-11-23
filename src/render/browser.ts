import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { openBrowser } from "@remotion/renderer";

/**
 * `angle` usa a GPU (Metal no Mac). `swangle` rasteriza em CPU: medido num episódio real, 279 contra
 * 600 frames/min, com imagem equivalente (PSNR 51,5 dB). Volte para `swangle` com RENDER_GL só se o
 * ambiente não tiver GPU — e rode o scanner de piscadas do QA nos dois casos.
 */
export function chromiumOptions() {
  const gl = (process.env.RENDER_GL ?? "angle") as "angle" | "swangle" | "egl" | "swiftshader" | "vulkan";
  return { gl };
}

/** Chrome Headless Shell próprio do Remotion, ou o executável em REMOTION_BROWSER_EXECUTABLE. Nunca o seu Chrome pessoal. */
export function browserExecutable(): string | null {
  return process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
}

export function launchBrowser() {
  return openBrowser("chrome", { chromiumOptions: chromiumOptions(), browserExecutable: browserExecutable() });
}

/**
 * Chrome headless que sobrou de um render morto segura o próximo em 0%. Mata só os que usam o
 * TMPDIR deste render (o perfil do Chrome vive lá), nunca outro Chrome da máquina.
 */
export function killOrphanBrowsers(): void {
  const dir = tmpdir();
  if (dir.length < 12) return; // nunca um padrão curto o bastante para casar com outra coisa
  spawnSync("pkill", ["-f", `chrome-headless-shell.*${dir.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`]);
}
