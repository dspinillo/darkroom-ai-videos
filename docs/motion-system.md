# Motion system

Princípio: **corte primeiro; anime só quando o movimento comunica hierarquia, sentido ou atenção.**

## Os seis primitivos

Implementados em `src/motion/primitives.ts` como funções puras do progresso, com um easing só
(cubic-out, sem overshoot).

| Primitivo | Forma | Duração | Uso |
|---|---|---|---|
| `CUT` | nenhuma | 0 ms | padrão entre cenas |
| `PUSH` | sobe 24 px + opacidade | 160–220 ms | entrada de texto |
| `REVEAL` | máscara horizontal, contraste cheio | 180–280 ms | evidência, citação, cartão |
| `TYPE` | caractere a caractere | 20–45 ms/caractere, teto ~900 ms | só código e prompt |
| `SCALE_EMPHASIS` | 1,00 → 1,045 → 1,00 | 180–260 ms | o número ou a palavra que a fala sublinha |
| `RULE_DRAW` | régua de acento cresce da esquerda | 160–240 ms | assinatura, separação |

REVEAL e PUSH têm geometria própria. Num dos canais de origem, o renderer recebia o primitivo e o
descartava: todas as entradas eram o mesmo fade. O teste `PUSH e REVEAL não desenham o mesmo frame`
existe por isso.

## Variação sem aleatoriedade

Cada cena recebe uma assinatura de câmera derivada do seu ordinal: direção do pan, amplitude, zoom e
âncora do texto (`sceneMotionVariant`). Dois usos do mesmo asset dificilmente saem iguais, e o
resultado é reprodutível. Antes disso, a única variação era `índice % 2`: duas assinaturas para 80
cortes.

## Proibido por padrão

Bounce, overshoot elástico, giro, flip 3D, zoom aleatório, tremor de câmera, glitch repetido, RGB
split, confete, explosão de partículas e tipografia cinética em toda palavra.

A última foi testada a sério (palavra a palavra, passando por trás da pessoa) e funcionou. Foi
descartada pelo custo recorrente por episódio, não pelo código. Ver `licoes.md`.

## Ritmo de edição

- gancho começa no primeiro frame; tese até 1,5 s;
- plano de 1,8–4,5 s nos Shorts, 3–7 s no longo; acima de 8 s só com ação visível ou animação
  progressiva (a auditoria avisa);
- num longo de 5–10 min, 65–90 cortes e de 20 a 30 assets únicos;
- pelo menos três modos visuais por minuto: b-roll, evidência, dado animado, diagrama, tipografia;
- tipografia em tela cheia é pontuação (gancho, pivô, conclusão), não a trilha visual padrão;
- nunca um segundo título sobre gráfico ou print que já tem título;
- gráfico e evidência em contraste cheio, nunca escurecidos como fundo decorativo.

## Legendas

Editoriais, não karaokê: até duas linhas, 3–6 palavras por linha, quebra em pontuação ou em pausa
real (≥ 350 ms), entrada de 140 ms. Nada de palavra pulando. No 9:16, a faixa fica acima dos 320 px
que a interface do YouTube cobre.

## B-roll

Todo plano de b-roll esclarece sujeito, consequência, evidência ou contexto. Nunca "b-roll de
tecnologia" só para ter movimento. Conceito abstrato (juros, crise, confiança) é tipografia ou
diagrama, não banco de imagem.

## Encerramento

Discreto: `> acompanhe`, `> continue`. Nada de cartão gritando "inscreva-se e ative o sininho".

## Os 48 efeitos da galeria

`npm run gallery` abre a galeria; `type: "effect"` põe qualquer um no episódio. Categorias:

| Categoria | Efeitos |
|---|---|
| Texto (15) | rolling, scramble, horizontal, blur, words, outline, highlight, wave, tracking, flipboard, echo, stretch, spotlight, type-delete, word-swap |
| Terminal e código (8) | terminal, code, chat, code-diff, api, logs, browser, searchbox |
| Ícones e fluxos (9) | icons, status, flow, orbit, branching, pipeline, timeline, network, checklist |
| Dados (8) | counter, bars, rings, line-chart, waffle, funnel, stacked, leaderboard |
| Composição (5) | compare, lower, quote, document, cards3d |
| Transições (3) | wipe, shutters, iris |

Terminal, código, chat e dados dos efeitos são **ilustrativos**: não executam nada. Num episódio
factual, o número na tela precisa vir de fonte verificada.

Use os efeitos com a mesma régua acima: um por trecho, quando ele explica algo que a frase sozinha
não explica.
