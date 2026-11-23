# Render: dois motores

| | Motor ao vivo (`engine: "live"`) | Motor de stills (`engine: "stills"`) |
|---|---|---|
| Como | Remotion renderiza cada frame no Chrome headless | Remotion renderiza **um PNG por plano**; FFmpeg aplica câmera e monta |
| Bom para | b-roll em vídeo, dado animado, digitação, efeitos da galeria, legenda queimada | foto de arquivo, documento, linha do tempo, Ken Burns lento |
| Movimento dentro do plano | tudo | só a câmera sobre a foto (`zoompan`) |
| Custo | ~600 frames/min (1080p30, Mac M2, `angle`) | ~1 PNG por plano + encode do FFmpeg |
| Legenda | queimada ou sidecar | sidecar (SRT/VTT) |
| Retomada | por bloco de 1800 frames | por plano (PNG e segmento já prontos são reaproveitados) |

Os dois entregam um vídeo **sem áudio**; o áudio master entra uma vez, no mux final.

## Motor ao vivo

```
Remotion renderMedia ─► bloco 0–1799 (sem áudio) ─┐
                     ─► bloco 1800–3599          ├─► concat (copy) ─► + master.wav ─► MP4
                     ─► …                        ─┘
```

- **Blocos sem áudio.** AAC por bloco carrega padding: 60,000 s de vídeo viravam 60,053 s de áudio,
  e um episódio montado assim ficou meio segundo mais longo que a timeline.
- **Blocos chaveados pelo hash do plano.** Mudou qualquer cena, mudou a pasta: nenhum bloco antigo é
  reaproveitado por engano. Plano igual, bloco pronto é pulado (retomada depois de uma queda).
- **Concorrência 2.** Subir não é a alavanca (4 rendeu 3%, 8 piorou 31% no mesmo Mac).

## Motor de stills

```
para cada plano:  Remotion renderStill ─► PNG (foto: fundo + sobreposição em camadas)
                  FFmpeg ─► segmento.mp4  (zoompan no fundo, sobreposição por cima, time_base 1/90000)
                  confere cada pacote no passo exato
ffconcat com duração explícita ─► concat (copy, PTS travados) ─► + master.wav ─► MP4
```

- **Camadas.** A foto é renderizada sem texto; o texto, sobre fundo transparente. O FFmpeg move só
  a foto. Mover o quadro composto arrastaria o título junto.
- **Base de tempo única.** Todo segmento sai com `-video_track_timescale 90000` e é conferido pacote a
  pacote. Misturar 1/90000 com 1/15360 deslocou um plano num episódio real.
- **Duração explícita no ffconcat.** O cabeçalho MP4 arredonda menos de 1 ms por arquivo; em 60
  segmentos isso acumula.

## Navegador e GPU

- `RENDER_GL=angle` (padrão) usa a GPU. `swangle` é CPU: 279 contra 600 frames/min, imagem
  equivalente. Use `swangle` só sem GPU, e rode o scanner de piscadas nos dois casos.
- O Remotion baixa o próprio Chrome Headless Shell no primeiro render. Não use o seu Chrome: no Canal
  B, o Chrome desktop gerou 15 frames corrompidos em 2.595. Para fixar uma versão, aponte
  `REMOTION_BROWSER_EXECUTABLE` e registre-a.
- Node nativo da arquitetura. Node x64 sob Rosetta num Mac ARM faz o Remotion baixar o navegador x64.

## Render longo

```bash
npm run darkroom -- render meu-episodio --detach
tail -f meu-episodio/out/render-*.log
```

`--detach` solta o processo da sessão (terminal, IDE, agente de IA) com log em arquivo. Renders
filhos de sessão interativa morreram calados nos canais de origem, sem crash report; destacados,
atravessaram 89 minutos. Antes de cada render, o framework mata Chrome headless órfão do mesmo TMPDIR
(sem isso, o próximo trava em 0%).

**TMPDIR.** O perfil do Chrome vive lá. Um render longo escreveu 137 GB num SSD interno. Use
`RENDER_TMPDIR=/Volumes/Externo/tmp`.

**Assets grandes.** Reduza fotos a 2160 px antes (`sips -Z 2160 *.jpg` no macOS,
`mogrify -resize 2160x2160\>` com ImageMagick). Um render de 80 fotos caiu de 1 h para 4 min.

## Conferir um trecho

```bash
npm run darkroom -- render meu-episodio --frames=900-1199
```

Sai `meu-episodio-trecho-900-1199.mp4`, com o áudio do trecho. Conferir uma cena de 8 s não deve
custar o episódio.
