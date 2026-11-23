import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEpisode } from "../core/episode.ts";

/**
 * Roteiro pela **assinatura** do seu agente, sem chave de API: o darkroom chama o Claude Code
 * (`claude -p`) ou o Codex (`codex exec`) em modo headless, com o playbook docs/agente-roteiro.md, e
 * valida o que ele entregar. Chave de API fica só para serviço externo (voz, YouTube, banco de imagem).
 *
 * O resultado é um **rascunho**: toda afirmação sai `pendente`, e o render recusa afirmação pendente.
 * O modelo escreve bem e inventa com a mesma fluência.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type Agent = "claude" | "codex";

function agentCommand(agent: Agent, dir: string, prompt: string): [string, string[]] {
  if (agent === "claude") {
    return [
      "claude",
      [
        "-p", prompt,
        "--add-dir", root,
        "--permission-mode", "acceptEdits",
        // Lê o repositório e as fontes, escreve só na pasta do episódio, valida com o próprio darkroom.
        "--allowedTools", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", `Bash(node ${root}/src/cli/main.ts plan:*)`,
      ],
    ];
  }
  return ["codex", ["exec", "--skip-git-repo-check", "-C", dir, "-s", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", prompt]];
}

function runAgent(agent: Agent, dir: string, prompt: string, log: (message: string) => void): Promise<void> {
  const [program, args] = agentCommand(agent, dir, prompt);
  log(`roteiro: chamando ${program} na sua assinatura (pode levar alguns minutos)…`);
  return new Promise((resolve, reject) => {
    // Chave de API no ambiente tem precedência sobre o login da assinatura e desviaria a cobrança
    // (ou falharia, se estiver vencida). O roteiro roda sempre pela assinatura.
    const env = { ...process.env };
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY"]) delete env[key];
    const child = spawn(program, args, { cwd: dir, env, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", (error) => reject(new Error(`não consegui rodar ${program}: ${error.message}. Instale e faça login no ${agent === "claude" ? "Claude Code" : "Codex"}.`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${program} terminou com código ${code}`))));
  });
}

function basePrompt(dir: string, minutes: number): string {
  return [
    `Siga integralmente o playbook ${path.join(root, "docs/agente-roteiro.md")} para o episódio na pasta ${dir}.`,
    `Alvo: cerca de ${minutes} minutos de narração (~${Math.round(minutes * 150)} palavras faladas).`,
    "Material na pasta: brief.md, dossie.md e, se existir, notas.md.",
    `Escreva o resultado em ${path.join(dir, "episode.draft.json")}. Não crie nem altere episode.json.`,
    "Toda afirmação com status \"pendente\". Termine com um resumo curto: duração estimada, cenas, afirmações a conferir e lacunas de imagem.",
  ].join("\n");
}

export async function draftScript(options: { dir: string; minutes: number; agent: Agent; log: (message: string) => void }) {
  const { dir, log } = options;
  for (const file of ["brief.md", "dossie.md"]) {
    if (!existsSync(path.join(dir, file))) throw new Error(`falta ${file} em ${dir} (ver docs/pauta-e-pesquisa.md)`);
  }
  const out = path.join(dir, "episode.draft.json");
  let prompt = basePrompt(dir, options.minutes);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await runAgent(options.agent, dir, prompt, log);
    if (!existsSync(out)) throw new Error(`o agente terminou sem escrever ${out}`);
    try {
      const draft = parseEpisode(JSON.parse(readFileSync(out, "utf8")));
      // Rascunho nunca sai com afirmação aprovada, mesmo que o agente tenha marcado.
      const forced = { ...draft, claims: draft.claims.map((claim) => ({ ...claim, status: "pendente" as const })) };
      writeFileSync(out, `${JSON.stringify(forced, null, 2)}\n`);
      writeFileSync(path.join(dir, "claims.md"), claimsChecklist(forced));
      log(`roteiro: ${forced.blocks.length} blocos, ${forced.scenes.length} cenas, ${forced.claims.length} afirmações pendentes`);
      log(`  ${out}\n  ${path.join(dir, "claims.md")} — confira cada afirmação na fonte antes de renomear para episode.json`);
      return out;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attempt === 2) throw new Error(`o rascunho continuou inválido depois da correção:\n${detail}`);
      log("roteiro: rascunho inválido, pedindo correção ao agente…");
      prompt = `O arquivo ${out} não passou na validação do darkroom:\n${detail}\n\nCorrija o arquivo seguindo ${path.join(root, "docs/episodio.md")} e o playbook ${path.join(root, "docs/agente-roteiro.md")}. Mantenha o conteúdo; ajuste só o que a validação aponta.`;
    }
  }
  throw new Error("inalcançável");
}

function claimsChecklist(episode: ReturnType<typeof parseEpisode>): string {
  const sources = new Map(episode.sources.map((source) => [source.id, source]));
  const lines = [`# Afirmações para conferir — ${episode.title}`, "", "Abra cada fonte, confira o texto exato e marque. Só depois mude o `status` no JSON para `verificada` (ou `descartada`, tirando do roteiro).", ""];
  for (const claim of episode.claims) {
    lines.push(`- [ ] **${claim.id}** — ${claim.text}`);
    for (const id of claim.sources) {
      const source = sources.get(id);
      lines.push(`  - ${source ? `${source.title} — ${source.url}` : id}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
