# QA

`darkroom qa <pasta>` roda sobre o último render e grava `out/qa-report.json`. Sai com erro se
alguma verificação falhar.

| Verificação | Pega | Origem do defeito real |
|---|---|---|
| stream de vídeo e áudio | codec, resolução, fps, canais | — |
| contagem de frames + duração | vídeo mais curto que a timeline | cartão final fora do plano de blocos (5 s a menos, render "com sucesso") |
| relógio dos frames | pacote fora do passo de um frame | base de tempo misturada no concat |
| decodificação integral | pacote corrompido | — |
| loudness | fora de -16 LUFS ±0,5 ou pico acima de -1,5 dBTP | mistura sem master |
| scanner de piscadas | frame que discorda dos vizinhos por 1–5 frames | Chrome desktop: 15 frames corrompidos em 2.595; piscada preta em todo corte |
| cada segmento no lugar (stills) | plano que entrou na hora errada | 1/90000 × 1/15360 deslocou um plano aos 700 s |
| folha das fronteiras | gera `qa-fronteiras.jpg`: antes, no corte e depois de cada corte | a piscada preta ficou semanas escondida porque a amostragem caía no meio dos planos |

## O scanner de piscadas

Reduz cada frame a 160×90 em tons de cinza e procura um frame que difere ≥ 8 níveis do anterior
enquanto o anterior e o seguinte (até 5 frames depois) diferem < 3 entre si. Um corte de verdade
persiste; uma piscada volta. Fade e Ken Burns não disparam. Roda em fluxo, com memória limitada.

Não é garantia de qualidade perceptual: é uma rede para a classe de defeito que nenhum teste de
unidade vê.

## O que o QA não cobre

Está escrito no próprio relatório, em `notCovered`:

- estética e legibilidade (texto pequeno, cor que não lê, título duplicado);
- sincronia de fala e imagem (a cena certa no momento certo);
- escuta (timbre, eco, pronúncia, mudança de voz);
- direitos de uso da mídia;
- fadiga de repetição em trechos longos.

**Depois do QA verde, alguém assiste ao vídeo inteiro.** Nos demos deste repositório, o QA passou na
primeira versão e a revisão dos frames achou cinco defeitos: rótulos pequenos demais para 1080p,
código cortado antes da última linha, um efeito com a paleta errada, texto duplicado sobre o b-roll e
o nome do canal ilegível. Na segunda rodada, os frames mostraram que o cache reaproveitava blocos
antigos depois de uma correção de código (ver `licoes.md`). Todos corrigidos antes do commit. É o caso de uso.

## Olhar frames rápido

```bash
# um frame do meio de cada cena, numa folha 3×N
ffmpeg -i out/demo-editorial-v1.mp4 -vf "select='eq(n\,47)+eq(n\,140)+eq(n\,236)',scale=640:-2,tile=3x1" -frames:v 1 -fps_mode vfr meio.jpg
```

Os frames de início de cada cena estão em `render-manifest.json` (`cutFrames`).
