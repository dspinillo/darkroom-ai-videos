import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

/** Diz o que existe e o que falta. Nunca imprime o valor de uma chave — só se ela está definida. */
export function doctor(): boolean {
  let ok = true;
  const line = (status: "ok" | "aviso" | "FALTA", label: string, detail: string) => {
    if (status === "FALTA") ok = false;
    console.log(`${status.padEnd(5)} ${label.padEnd(26)} ${detail}`);
  };
  const major = Number(process.versions.node.split(".")[0]);
  line(major >= 24 ? "ok" : "FALTA", "Node.js", `${process.version} (precisa ≥ 24: roda TypeScript direto)`);

  for (const tool of ["ffmpeg", "ffprobe"]) {
    const result = spawnSync(tool, ["-version"], { encoding: "utf8" });
    line(result.status === 0 ? "ok" : "FALTA", tool, result.status === 0 ? (result.stdout.split("\n")[0] ?? "") : "instale o FFmpeg (brew install ffmpeg / apt install ffmpeg)");
  }

  const say = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  const ptVoices = say.status === 0 ? say.stdout.split("\n").filter((voiceLine) => /pt_BR/u.test(voiceLine)).length : 0;
  line(say.status === 0 ? "ok" : "aviso", "voz local (say)", say.status === 0 ? `${ptVoices} vozes pt_BR no sistema` : "sem `say` (macOS): o demo usa narração muda");

  if (process.platform === "darwin") {
    const translated = spawnSync("sysctl", ["-n", "sysctl.proc_translated"], { encoding: "utf8" }).stdout.trim();
    line(translated === "1" ? "aviso" : "ok", "arquitetura", translated === "1" ? "Node x64 rodando sob Rosetta: o Remotion baixa navegador x64. Use Node ARM64." : `${process.arch} nativo`);
  }

  const python = process.env.DARKROOM_PYTHON ?? "python3";
  const aligner = spawnSync(python, ["-c", "import importlib.util as u; print('mlx-audio' if u.find_spec('mlx_audio') else 'faster-whisper' if u.find_spec('faster_whisper') else '')"], { encoding: "utf8" });
  const alignerName = aligner.status === 0 ? aligner.stdout.trim() : "";
  line(alignerName ? "ok" : "aviso", "alinhador local", alignerName ? `${alignerName} em ${python}` : `sem mlx-audio nem faster-whisper em ${python}: voz gravada/local terá tempo estimado (docs/voz.md)`);

  for (const [agent, label] of [["claude", "Claude Code"], ["codex", "Codex"]] as const) {
    const found = spawnSync(agent, ["--version"], { encoding: "utf8" }).status === 0;
    line(found ? "ok" : "aviso", `agente: ${label}`, found ? "instalado (roteiro pela sua assinatura)" : "não instalado (darkroom roteiro precisa de um dos dois)");
  }

  line("ok", "RENDER_GL", process.env.RENDER_GL ?? "angle (padrão; swangle se não houver GPU)");
  line("ok", "navegador", process.env.REMOTION_BROWSER_EXECUTABLE ?? "Chrome Headless Shell do Remotion (baixado no primeiro render)");
  const tmp = process.env.RENDER_TMPDIR ?? `${tmpdir()} → no render: <episódio>/out/tmp`;
  line(process.env.RENDER_TMPDIR ? "ok" : "aviso", "RENDER_TMPDIR", `${tmp}. Render longo escreve dezenas de GB: aponte para disco externo.`);

  for (const key of ["ELEVENLABS_API_KEY", "YOUTUBE_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY"]) {
    const present = Boolean(process.env[key]);
    line(present ? "ok" : "aviso", key, present ? "definida" : "ausente (opcional; o demo não precisa)");
  }
  return ok;
}
