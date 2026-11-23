# Instruções para agentes (Claude Code)

Este repositório é o framework darkroom (vídeo narrado com Remotion + FFmpeg). Docs em PT-BR,
código em inglês.

- **Escrever roteiro de episódio:** siga `docs/agente-roteiro.md`.
- **Formato do episódio:** `docs/episodio.md`. **Lições que viraram regra:** `docs/licoes.md`.
- Node 24 roda os `.ts` direto. Antes de entregar mudança de código: `npm run check`.
- Mudou cena ou motion? Renderize um demo (`npm run demo`) e **olhe os frames** (`docs/qa.md`).
  Teste verde não vê a tela.
- Nunca commite `.env`, chave, áudio de narração ou mídia licenciada.
- Nunca marque afirmação (`claims`) como `verificada`: isso é do humano.
