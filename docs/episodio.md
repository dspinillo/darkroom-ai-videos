# O formato do episódio

Um episódio é uma pasta:

```
meu-episodio/
├─ episode.json      # o contrato (este documento)
├─ assets/           # fotos, vídeos, trilha — o que o JSON declarar
└─ out/              # gerado: voz, blocos, stills, MP4, legendas, QA (não versionar)
```

O `episode.json` diz **o que** aparece. Cor, fonte, tamanho e easing são do tema (`src/theme`):
o schema recusa campo visual livre de propósito. Os três exemplos em `examples/` cobrem os dois
motores e o 9:16.

## Campos do episódio

| Campo | Padrão | O que é |
|---|---|---|
| `id` | — | minúsculas, números e hífen; vira o nome do MP4 |
| `title`, `channelName` | — | título (metadado do MP4) e nome que aparece nas cenas |
| `format` | `landscape` | `landscape` (1920×1080) ou `portrait` (1080×1920, Short) |
| `fps` | `30` | precisa dividir 90000 (24, 25, 30, 60) |
| `theme` | `editorial` | `editorial` ou `documentary`; crie o seu em `src/theme/theme.ts` |
| `engine` | `live` | `live` (Remotion renderiza tudo) ou `stills` (Remotion compõe, FFmpeg move) |
| `captions` | `burn` no live, `sidecar` no stills | legenda queimada ou só SRT/VTT |
| `tailSeconds` | `2` | respiro depois da última palavra |
| `voice` | — | ver abaixo |
| `blocks` | — | o roteiro, em blocos de fala |
| `scenes` | — | as cenas, em ordem cronológica da fala |
| `assets` | `[]` | mídia com crédito e licença |
| `music` | — | `{ file, volumeDb, credit, license }`, trilha em loop sob a voz |
| `rules` | 60 s / 8 s | `minAssetGapSeconds` (repetição) e `maxStaticSeconds` (plano parado) |

### Voz

```json
{ "provider": "elevenlabs", "voiceId": "…", "model": "eleven_multilingual_v2",
  "settings": { "stability": 0.55, "similarity_boost": 0.75, "style": 0, "use_speaker_boost": true, "speed": 0.93 },
  "gapSeconds": 0.4 }
```

| Provedor | Campos | Tempo das palavras | Custo |
|---|---|---|---|
| `elevenlabs` | `voiceId`, `model`, `settings` | medido pela API | pago; só gera com `--live` |
| `gravacao` | `recordings: "voz/{block}.wav"` | medido pelo alinhador local | grátis |
| `local` | `command: [... "{text}" ... "{dir}"]` | medido pelo alinhador local | grátis |
| `local-api` | `endpoint`, `voiceId`, `model`, `body` | medido pelo alinhador local | grátis |
| `say` | `sayVoice` | medido (se houver alinhador) | grátis, só macOS |
| `silence` | `wordsPerMinute` | estimado | grátis; para montar antes da voz existir |

Outros campos: `align` (`auto`/`off`), `alignLanguage` (`Portuguese`, `English`…), `polish`
(tratamento da voz; padrão ligado para gravação e TTS local). Detalhes em `docs/voz.md`.

Com tempo estimado, o manifesto marca `timingEstimated: true` e o QA avisa. Serve para montar e
revisar; para entregar, use voz com alinhamento ou confira legenda e cortes no ouvido.

### Blocos

```json
{ "id": "b3", "text": "Quem achou foi alguém olhando o frame certo." }
```

Um bloco é a unidade de geração e de cache: corrigir uma frase regenera um bloco. Blocos de 1 a 4
frases funcionam bem. Escreva números por extenso se quiser que a voz os leia de um jeito específico.

### Fontes e afirmações

```json
"sources": [{ "id": "cook-2004", "title": "Universality in Elementary Cellular Automata", "url": "https://…", "accessed": "2026-11-23" }],
"claims": [{ "id": "prova-2004", "text": "Matthew Cook publicou a prova em 2004", "sources": ["cook-2004"], "status": "verificada" }]
```

Toda afirmação factual do roteiro entra em `claims`, apontando para `sources`. Status: `pendente`
(rascunho), `verificada` (alguém conferiu na fonte) ou `descartada`. **O render recusa afirmação
pendente.** Cena que mostra o dado leva `"claim": "prova-2004"`. Ver `docs/pauta-e-pesquisa.md`.

### Assets

```json
{ "id": "porto-1952", "file": "assets/porto-1952.jpg", "kind": "image",
  "credit": "Arquivo Nacional, fundo X, 1952", "license": "domínio público",
  "source": "https://…", "embeddedText": false, "generated": false }
```

`credit` e `license` são obrigatórios. `embeddedText: true` marca arte que já traz texto (a auditoria
recusa título por cima). `generated: true` marca reconstrução ou ilustração. `trimStart` (segundos)
corta o início de um vídeo.

## Âncora: onde a cena começa

```json
"at": 0                                        // segundo absoluto (use só na primeira cena)
"at": { "block": "b2" }                        // primeira palavra do bloco
"at": { "block": "b2", "phrase": "cinco saídas" }  // primeira vez que o bloco diz isso
```

A comparação ignora maiúsculas e pontuação nas pontas. A primeira cena sempre começa no frame 0. Cena
fora de ordem ou frase que a fala não diz é erro, com o nome da cena.

## As 16 cenas

### Editoriais

| `type` | Campos | Uso |
|---|---|---|
| `hook` | `title`, `kicker?`, `asset?` | abertura; com asset, o título vai por cima da mídia |
| `statement` | `title`, `subtitle?` | frase que merece pausa; pivô, conclusão |
| `stat` | `value`, `format`, `baseline?`, `unit?`, `label`, `source` | um número, com fonte obrigatória |
| `quote` | `text`, `author`, `role?` | citação; nunca pôster motivacional |
| `comparison` | `title`, `left: [rótulo, valor]`, `right` | antes/depois, A contra B |
| `steps` | `title`, `items[2..5]`, `stage?` | lista com o item atual em destaque |
| `code` | `title?`, `lines[1..14]` | código ou prompt digitado |
| `broll` | `asset`, `caption?` | mídia em tela cheia; a legenda carrega a explicação |
| `takeaway` | `headline`, `label?` | a regra do episódio |
| `cta` | `text` | encerramento discreto (`> acompanhe`) |

`stat.format`: `number`, `percent` (proporção absoluta: `80%`) ou `index` (variação contra
`baseline`, com sinal: `−20%`). O rótulo é calculado do valor; ninguém escreve "+10%" à mão.

### Documentais

| `type` | Campos | Uso |
|---|---|---|
| `photo` | `asset`, `title`, `subtitle?`, `eyebrow?`, `hero?`, `cropY?`, `motion?` | foto em tela cheia; `motion: push` (aproxima) ou `pull` (afasta) |
| `archive` | `asset`, `title`, `subtitle?`, `sourceNote?` | documento ou foto de arquivo inteira, sem corte |
| `chronology` | `title`, `timeline: [[ano, rótulo]…]`, `stage` | linha do tempo; repita a cena com `stage` maior para avançar |
| `cards` | `title`, `items: [[título, detalhe]…]`, `subtitle?` | 2 a 4 pontos lado a lado |
| `report` | `title`, `reportTitle`, `items: [[rótulo, valor]…]`, `reportAuthor?`, `date?`, `subtitle?` | resumo editorial de um documento; diz que é resumo |

### Efeito da galeria

```json
{ "id": "busca", "type": "effect", "at": { "block": "b4" }, "effect": "searchbox", "text": "quem confere a IA?" }
```

Qualquer um dos 48 efeitos (`npm run gallery` para ver). Roda uma vez, até 5 s, e para no estado
final legível. Cor e fundo seguem o tema; `color` e `bg` sobrescrevem. No motor de stills, aparece só
o estado final.

## O que a auditoria recusa antes do render

- afirmação `pendente`, ou cena que mostra afirmação `descartada`;
- asset que volta em menos de `minAssetGapSeconds` (padrão 60 s);
- asset com `embeddedText` numa cena que desenha título;
- cena fora de ordem, frase que não existe, buraco ou sobra na cobertura de frames.

E avisa (sem bloquear) plano estático acima de `maxStaticSeconds` e cena de dado sem `claim` quando o
episódio tem afirmações.
