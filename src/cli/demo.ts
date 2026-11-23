import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../render/ffmpeg.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Os demos não usam mídia de terceiro: toda imagem é gerada pelo próprio FFmpeg (fontes `lavfi`).
 * Isso deixa o repositório sem nada a licenciar e faz o demo rodar offline.
 */
const recipes: Record<string, Record<string, string[]>> = {
  editorial: {
    "assets/gradiente.mp4": ["-f", "lavfi", "-i", "gradients=s=1920x1080:c0=0x0b0b0c:c1=0xff6b3d:c2=0x1d2a3a:speed=0.012:d=12:r=30", "-t", "12"],
    "assets/vida.mp4": ["-f", "lavfi", "-i", "life=s=480x270:mold=10:r=30:ratio=0.08:life_color=#ff6b3d:death_color=#0b0b0c:mold_color=#3a2a24", "-vf", "scale=1920:1080:flags=neighbor", "-t", "12"],
  },
  short: {
    "assets/gradiente-vertical.mp4": ["-f", "lavfi", "-i", "gradients=s=1080x1920:c0=0x0b0b0c:c1=0xff6b3d:c2=0x1d2a3a:speed=0.015:d=12:r=30", "-t", "12"],
  },
  documentary: {
    "assets/mandelbrot.png": ["-f", "lavfi", "-i", "mandelbrot=s=2400x1350:maxiter=1500:outer=normalized_iteration_count", "-vf", "hue=s=0.3", "-frames:v", "1"],
    "assets/mandelbrot-detalhe.png": ["-f", "lavfi", "-i", "mandelbrot=s=2400x1350:maxiter=3000:start_scale=0.004:start_x=-0.743643887037151:start_y=0.131825904205330:outer=normalized_iteration_count", "-vf", "hue=s=0.3", "-frames:v", "1"],
    "assets/jogo-da-vida.png": ["-f", "lavfi", "-i", "life=s=640x360:mold=10:ratio=0.12:life_color=#c9a26b:death_color=#111b1b:mold_color=#2f4744:seed=7", "-vf", "trim=start_frame=180,scale=1920:1080:flags=neighbor", "-frames:v", "1"],
    "assets/regra-110.png": ["-f", "lavfi", "-i", "cellauto=rule=110:s=640x360:full=1:random_seed=11", "-vf", "negate,colorchannelmixer=rr=0.79:gg=0.64:bb=0.42,scale=1920:1080:flags=neighbor", "-frames:v", "1"],
  },
};

export const demoNames = Object.keys(recipes);

export function prepareDemo(name: string, log: (message: string) => void): string {
  const recipe = recipes[name];
  if (!recipe) throw new Error(`demo desconhecido: ${name} (use ${demoNames.join(", ")})`);
  const dir = path.join(root, "examples", name);
  for (const [file, args] of Object.entries(recipe)) {
    const target = path.join(dir, file);
    if (existsSync(target)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    log(`gerando ${file} com FFmpeg…`);
    const encode = file.endsWith(".mp4") ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-an"] : [];
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, ...encode, target]);
  }
  return dir;
}
