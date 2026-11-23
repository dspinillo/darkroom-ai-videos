# Caso: Canal A — análise em PT-BR, motor ao vivo

## O canal

Análise sobre trabalho e tecnologia, em português. Episódios longos de 5 a 10 minutos, com Short 9:16
derivado. Voz sintética com direção fixa, b-roll de banco, dado animado e tipografia editorial.

## Como foi montado

- Monorepo TypeScript com pacotes separados: descoberta de pauta, pesquisa, transcrição local,
  planejamento de vídeo, renderer, marca. Cerca de 160 testes.
- Contrato em duas etapas: um `VideoSpec` (o que cada cena diz) compilado num `RenderPlan` (frames,
  layout, motion), com o brand system como única fonte de cor, fonte e tempo de animação.
- Dado na tela amarrado a uma afirmação aprovada: cena com número sem claim verificada não compila.
- Render Remotion em blocos de 60 s, destacado da sessão, com `gl: angle`.
- Publicação governada: 12 títulos em 4 eixos, 3 thumbnails em 2 formatos.

## O que deu errado (e virou regra)

| Problema | Medida | Regra |
|---|---|---|
| piscada preta em todo corte | luma 128 → 8 → 125 | olhar as fronteiras, scanner de frames |
| render morria calado | 8m01s morto, 8m03s vivo | render destacado com log |
| render lento | 279 → 600 frames/min | `gl: angle` |
| AAC por bloco | +0,49 s num episódio | blocos sem áudio |
| tokenizador perdendo `%` e aspas | 9 + 6 + 1 caracteres | palavra = tudo entre espaços |
| cena atrasada em relação à fala | 1 min 20 s | âncora na frase falada |
| mesmo visual em círculo | 96 → 74 cenas | asset não volta antes de 60 s |
| legenda sob a UI do Short | 320 px | safe zone hostil no 9:16 |
| `.env` no git | 3 chaves no histórico | `.gitignore` no primeiro commit |

## O que foi descartado

- Tipografia cinética passando por trás da pessoa: funcionou, custava edição manual por corte.
- TTS por instrução de um segundo provedor: passou nas métricas, mudava de voz na escuta.
- Pontuar títulos por "potencial de CTR" com LLM: o modelo não tem esse dado.

## O que levar daqui

A régua de marca escrita antes do código (motion, texto, voz) foi o que permitiu recusar técnica ruim
rápido. Comece por `brand-kit/`.
