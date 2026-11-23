# Nicho, pauta e pesquisa

O render é a parte fácil. O que decide se um canal dark anda é **sobre o que** ele fala e **se o que
ele diz é verdade**. Esta é a etapa que mais pesa e a que menos dá para automatizar.

## 1. Nicho: uma frase que diz o que o canal é

Os dois canais de origem começaram assim:

| | Canal A | Canal B |
|---|---|---|
| Tese | como crescer profissionalmente num mundo mudado por IA | histórias reais que parecem inventadas |
| Formato | análise de 5–10 min, Short derivado | minidocumentário de 12–25 min |
| Âncora de credibilidade | dado e estudo citados na tela | foto de arquivo e documento |
| O que recusa | hype, coach, pânico | reconstrução que finge ser arquivo |

Para escolher o seu, responda por escrito:

1. **Quem assiste e em que situação?** "Profissional de 25–40 anos indo pro trabalho" é útil;
   "pessoas interessadas em tecnologia" não é.
2. **Que pergunta essa pessoa faz?** Na linguagem dela, não na sua.
3. **Existe material visual?** Canal de história sem arquivo vira banco de imagem genérico. Canal de
   análise sem dado vira opinião.
4. **Você consegue fazer 20 episódios?** Liste 20 pautas antes de começar. Se travar na oitava, o
   nicho é estreito demais.
5. **O que você recusa?** Escreva em `brand-kit/COPY_STYLE.md`. É isso que separa o canal de mais um.

## 2. Pauta: interesse do público ≠ fato verdadeiro

São duas perguntas diferentes, com fontes diferentes:

| Pergunta | Fonte | Ferramenta |
|---|---|---|
| Alguém quer assistir? | o que já existe no YouTube, buscas, comentários | `darkroom pesquisa` (YouTube) + `templates/audience-brief.md` |
| O que vou dizer é verdade? | paper, documento, dado oficial, imprensa que cita fonte | `darkroom pesquisa` (Crossref, RSS) + leitura da fonte |

Um vídeo com 2 milhões de views prova que o tema atrai. Não prova que a afirmação dele está certa.

**Sinais de interesse que o ranking usa:**
- *Demanda perene*: vídeo com mais de um ano ainda somando 20+ views por hora. Tema que dura.
- *Novidade*: publicado nos últimos dias. Tema de atualidade, que envelhece rápido.
- Formato longo (5+ min) com boa audiência: o público aceita profundidade.

Um vídeo de dois dias com mil views não prova nada: toda estreia sobe.

**No Canal B**, as pautas vieram em lotes de três por região, cada uma com pesquisa inicial antes da
escolha, e com duas ou três reservas aprovadas. Pauta sem material de arquivo suficiente foi para a
reserva.

## 3. Rodar a pesquisa

```bash
npm run darkroom -- novo episodios/ep001        # cria brief.md e watchlist.json
# preencha o brief e as buscas
npm run darkroom -- pesquisa episodios/ep001     # gera dossie.md e dossie.json
```

`watchlist.json`:

```json
{
  "queries": ["regra 110 autômato celular", "cellular automaton universality"],
  "lookbackDays": 365,
  "maxResultsPerQuery": 10,
  "youtube": { "enabled": true, "regionCode": "BR", "relevanceLanguage": "pt", "order": "relevance" },
  "crossref": { "enabled": true, "contactEmail": "voce@exemplo.com" },
  "feeds": [{ "label": "Nome do blog", "url": "https://exemplo.com/feed.xml" }]
}
```

- Busque nos dois idiomas: a literatura acadêmica está quase toda em inglês.
- `contactEmail` coloca você na fila "educada" do Crossref (sem ele, 429 é comum).
- Feeds: só entram itens que mencionam alguma das buscas.

### Chave do YouTube (grátis)

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto.
2. *APIs e serviços → Biblioteca* → **YouTube Data API v3** → Ativar.
3. *Credenciais → Criar credenciais → Chave de API*. Restrinja a chave à YouTube Data API v3.
4. `.env`: `YOUTUBE_API_KEY=...`.

A cota gratuita é de 10 mil unidades por dia; cada busca custa 100. Uma watchlist com 4 buscas usa
~400. Essa chave só lê metadados públicos: **não serve para baixar vídeo**, e o framework não baixa.
Usar trecho de vídeo de terceiro exige licença; o dossiê é para entender o assunto e o público.

## 4. Do dossiê ao roteiro

Roda no agente que você já assina, sem chave de API:

```bash
npm run darkroom -- roteiro episodios/ep001 --minutos=8                 # Claude Code (claude -p)
npm run darkroom -- roteiro episodios/ep001 --minutos=8 --agente=codex  # Codex (codex exec)
```

O darkroom chama o agente em modo headless com o playbook [`agente-roteiro.md`](agente-roteiro.md),
lendo `brief.md`, `dossie.md` e `notas.md` (suas anotações das fontes, opcional mas recomendado).
O agente pode abrir as fontes na web. Ao fim, o darkroom valida o `episode.draft.json`; se não passar,
devolve os erros ao agente uma vez para corrigir. Prefere conversar? Abra o Claude Code ou o Codex na
pasta e peça: "siga docs/agente-roteiro.md para episodios/ep001".

**Toda afirmação sai pendente.** O render recusa afirmação pendente.

## 5. Conferir as afirmações

`claims.md` lista cada afirmação com a fonte. Para cada uma:

1. Abra a fonte. Ache o trecho exato.
2. O número é o mesmo? A data? O sentido? (Resumo de paper não é o paper; manchete não é o estudo.)
3. No `episode.json`, mude `status` para `verificada`, ou para `descartada` e tire do roteiro.

```json
"claims": [
  { "id": "prova-2004", "text": "Matthew Cook publicou a prova em 2004", "sources": ["cook-2004"], "status": "verificada" }
]
```

Cena que mostra dado (`stat`, `report`, `comparison`, `chronology`, `quote`) aponta para a afirmação
com `"claim": "prova-2004"`; sem isso, a auditoria avisa.

Os dois canais de origem nunca publicaram número sem essa conferência. O modelo escreve bem e inventa
com a mesma fluência.
