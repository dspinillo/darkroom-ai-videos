# Playbook: roteiro com um agente

Instruções para um agente de código (Claude Code, Codex, Cursor) levar um episódio da pauta ao
`episode.draft.json`. Sem chave de API: o agente usa a sua assinatura. Dois jeitos de rodar:

- `npm run darkroom -- roteiro episodios/ep001` (headless; `--agente=codex` para o Codex), ou
- numa sessão interativa: "siga docs/agente-roteiro.md para episodios/ep001".

---

## Para o agente

Você vai escrever o rascunho de um episódio do framework darkroom. Trabalhe na pasta indicada.

### Leia antes

1. `docs/episodio.md` — o formato do `episode.json`. O schema é estrito.
2. `examples/editorial/episode.json` e `examples/documentary/episode.json` — exemplos válidos.
3. `brand-kit/COPY_STYLE.md` (ou `COPY_STYLE.md` na pasta do episódio) — como o canal fala e o que
   nunca diz.
4. `docs/motion-system.md` — ritmo, tipos de cena, o que é proibido.
5. Na pasta do episódio: `brief.md`, `dossie.md` e `notas.md` (se existir).

### Etapa 1 — pesquisa

- Do `dossie.md`, escolha as fontes que sustentam o episódio. Prefira fonte primária (paper,
  documento, dado oficial) a matéria que a cita.
- **Abra cada fonte que você for usar** e anote em `notas.md`: o trecho exato, a URL e a data de
  acesso. Se você não tem acesso à web, pare e peça as fontes ao usuário.
- Faltou dado para um trecho? Pesquise. Não achou? O trecho fica sem número.

### Etapa 2 — afirmações

Monte a lista de afirmações antes do texto. Cada número, data, citação ou resultado de estudo vira:

```json
{ "id": "kebab-curto", "text": "a afirmação exata", "sources": ["id-da-fonte"], "status": "pendente" }
```

e cada fonte, `{ "id", "title", "url", "accessed" }`. Status sempre `pendente`: quem verifica é o
humano.

### Etapa 3 — roteiro em blocos

- Blocos de 1 a 4 frases; um bloco é a unidade de geração de voz.
- Números por extenso na fala ("cento e cinquenta e oito"), valor numérico na cena (`158`).
- Pergunta falada: palavra interrogativa no começo, uma por frase, nunca terminar em `?".`.
- Gancho no primeiro bloco: uma lacuna precisa de informação em 4 a 10 palavras. Sem pânico fabricado.
- Ritmo de ~150 palavras por minuto: 8 minutos ≈ 1.200 palavras.

### Etapa 4 — cenas

- Primeira cena `at: 0`; as demais `at: { "block": "bN", "phrase": "trecho literal do bloco" }`.
- Ordem cronológica da fala. Uma cena a cada 3–7 s em média.
- Pelo menos três tipos de cena por minuto. Tipografia em tela cheia (`statement`) só para gancho,
  virada e conclusão.
- Cena com dado leva `"claim"`.
- Não invente asset. Sem mídia, use cenas de texto, dado ou efeito, e escreva em `"note"` a imagem que
  a cena pediria (ex.: "foto de arquivo do laboratório, anos 1980") para a busca depois.

### Etapa 5 — entregar

1. Salve `episode.draft.json` na pasta do episódio, com `"voice": { "provider": "silence" }`.
2. Rode `npm run darkroom -- plan <pasta>` apontando para uma cópia como `episode.json` numa pasta
   temporária, e corrija até não haver erro de schema nem de âncora. (Afirmações pendentes aparecem
   como erro: é o esperado.)
3. Gere `claims.md`: cada afirmação com a fonte, como checklist.
4. Resuma para o usuário: duração estimada, número de cenas, afirmações a conferir e lacunas de
   imagem (as `note`).

### Nunca

- Afirmação sem fonte aberta por você.
- Citação literal que não está no texto da fonte.
- Marcar afirmação como `verificada`.
- Escrever por cima de um `episode.json` existente.
