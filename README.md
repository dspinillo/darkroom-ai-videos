# darkroom-ai-videos

Framework para produzir vídeos de canal dark (narração + imagem, sem rosto) com **Remotion** e
**FFmpeg**: roteiro em blocos, voz com tempo por caractere, cenas ancoradas na fala, render em dois
motores e um QA que pega os defeitos que teste nenhum vê.

Saiu de dois canais reais, produzidos do zero até o YouTube:

| | Canal A | Canal B |
|---|---|---|
| Formato | análise em PT-BR, 5–10 min + Short 9:16 | minidocumentário em inglês, 12–25 min |
| Imagem | b-roll em vídeo, dado animado, tipografia | foto de arquivo, documento, linha do tempo |
| Motor | ao vivo (Remotion renderiza cada frame) | stills (Remotion compõe, FFmpeg move a câmera) |
| Produzido | 4 episódios longos + Shorts | 9 episódios completos, 11 em pré-produção |

Os erros que custaram caro nesses dois canais viraram travas no código. Estão em
[`docs/licoes.md`](docs/licoes.md), com a medida de cada um.

## Rodar o demo em 3 comandos

Precisa de Node.js 24+ e FFmpeg. Nenhuma chave.

```bash
npm install
npm run doctor
npm run demo            # ou: npm run demo -- documentary   |   npm run demo -- short
```

O demo gera as próprias imagens com o FFmpeg (fractais, Jogo da Vida, autômato celular), narra com a
voz do sistema (`say`, no macOS; em outro sistema sai mudo) e entrega em `examples/<demo>/out/`:

- `demo-*-v1.mp4` — o vídeo
- `*.srt` e `*.vtt` — legendas
- `qa-report.json` e `qa-fronteiras.jpg` — o relatório e a folha de contato dos cortes
- `render-manifest.json` — tudo que entrou no render, com hash

A primeira execução baixa o Chrome Headless Shell do Remotion (~95 MB).

## Do tema ao vídeo

| Etapa | Comando | Guia |
|---|---|---|
| Nicho e pauta | `darkroom novo` + `brief.md` | [`docs/pauta-e-pesquisa.md`](docs/pauta-e-pesquisa.md) |
| Pesquisa | `darkroom pesquisa` (YouTube, Crossref, RSS → `dossie.md`) | idem |
| Roteiro | `darkroom roteiro` chama o Claude Code ou o Codex na sua assinatura, com o playbook [`docs/agente-roteiro.md`](docs/agente-roteiro.md) | idem |
| Conferir fatos | `claims.md` → `status: verificada` | o render recusa afirmação pendente |
| Imagens | `darkroom stock` (Pexels, Pixabay) | [`docs/banco-de-imagens.md`](docs/banco-de-imagens.md) |
| Voz | ElevenLabs, **sua gravação**, TTS local (mlx-audio, VoiceStudio) ou `say` | [`docs/voz.md`](docs/voz.md) |
| Render e QA | `darkroom render` + `darkroom qa` | [`docs/render.md`](docs/render.md), [`docs/qa.md`](docs/qa.md) |
| Publicação | `templates/publish-package.md` | [`docs/publicacao.md`](docs/publicacao.md) |

## Como funciona

```
roteiro em blocos ─► voz por bloco (cache) ─► palavras com tempo ─► legendas
                                                    │
episode.json: cenas ancoradas em frases ───────────►├─► timeline ─► auditoria editorial
                                                    │
                          motor ao vivo  ou  motor de stills ─► vídeo sem áudio
                                                    │
                       áudio master (ganho constante) ─► mux ─► QA ─► você assiste
```

Um episódio é uma pasta com `episode.json` e `assets/`. O JSON diz **o que** aparece; o tema diz
**como**. Exemplo de cena:

```json
{ "id": "testes", "type": "stat", "at": { "block": "b1", "phrase": "cento e cinquenta" },
  "value": 158, "label": "testes passando", "source": "canal A, episódio piloto" }
```

A cena começa quando a narração diz "cento e cinquenta". Não existe minutagem escrita à mão. Formato
completo e as 16 cenas: [`docs/episodio.md`](docs/episodio.md).

## Comandos

```bash
npm run darkroom -- novo episodios/ep001                # pasta nova com brief.md e watchlist.json
npm run darkroom -- pesquisa episodios/ep001            # dossie.md de YouTube, Crossref e RSS
npm run darkroom -- roteiro episodios/ep001 --minutos=8 # rascunho pelo Claude Code (--agente=codex), sem chave
npm run darkroom -- plan examples/editorial          # valida, monta voz e timeline, mostra custo e avisos
npm run darkroom -- render examples/editorial        # renderiza; nunca sobrescreve o MP4 anterior
npm run darkroom -- render meu-ep --detach           # destacado da sessão, com log em arquivo
npm run darkroom -- render meu-ep --frames=900-1200  # só um trecho, para conferir uma cena
npm run darkroom -- render meu-ep --live             # autoriza gastar crédito de voz
npm run darkroom -- qa examples/editorial            # QA do último render
npm run darkroom -- stock "pessoa digitando" --provider=pexels   # candidatos de b-roll + folha de contato
npm run darkroom -- stock --baixar candidatos.json pexels-123 --para=ep/assets   # baixa os escolhidos
npm run studio                                       # Remotion Studio com as composições e os 48 efeitos
npm run gallery                                      # galeria interativa dos efeitos
```

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `src/core` | contrato do episódio, alinhamento, legendas, timeline e auditoria editorial |
| `src/motion` | 6 primitivos de motion e os 48 efeitos da galeria |
| `src/scenes` | 10 cenas editoriais e 5 documentais, tematizáveis |
| `src/theme` | os dois temas de exemplo; copie um para criar a sua marca |
| `src/render` | motor ao vivo, motor de stills, áudio master, navegador |
| `src/qa` | scanner de piscadas e o relatório de entrega |
| `src/research` | pauta e pesquisa (YouTube, Crossref, RSS) e roteiro via agente |
| `src/providers` | voz (ElevenLabs, gravação, TTS local, `say`) e busca de b-roll (Pexels, Pixabay) |
| `tools/align.py` | alinhador local: tempo medido de cada palavra sem ElevenLabs |
| `gallery/` | a galeria de motion, para escolher efeito e copiar a configuração |
| `brand-kit/` | modelos de marca, motion, texto e voz para preencher |
| `templates/` | pacote de publicação, brief de audiência, planilhas de métricas |
| `docs/` | pipeline, motores, QA, voz, motion, lições e os dois estudos de caso |

## As regras que valem mais que o código

1. **Nenhuma fatia de vídeo fecha sem alguém olhar os frames**, inclusive nas fronteiras entre planos.
2. **Métrica não substitui escuta.** LUFS e transcrição triam; timbre, eco e naturalidade só o ouvido aprova.
3. **Tempo de cena vem da fala**, nunca do storyboard.
4. **Corte primeiro, anime só o que comunica.**
5. **Reconstrução por IA nunca se passa por arquivo.** Procedência e licença por asset.
6. **Divergir antes de escolher**: 12 títulos, 3 thumbnails, e o teste do YouTube decide.

## Chaves e custos

Nada aqui precisa de chave para rodar. Para produção, copie `.env.example` para `.env` e preencha
só o que usar: ElevenLabs (voz paga), YouTube (pesquisa, grátis), Pexels e Pixabay (b-roll,
grátis). O roteiro não usa chave: roda no Claude Code ou no Codex, pela sua assinatura. Cada guia diz onde se cadastrar e como gerar a chave. `darkroom doctor` diz se cada variável existe e nunca imprime o valor. Voz paga só é
gerada com `--live`, e o `plan` mostra antes quantos caracteres faltam no cache. **Nunca commite o
`.env`**: o `.gitignore` já cobre, e um dos canais de origem teve chaves expostas exatamente assim.

## Licenças

- Código: MIT ([LICENSE](LICENSE)).
- **Remotion tem licença própria**: gratuita para pessoas físicas e empresas de até 3 pessoas; acima
  disso exige licença comercial. Confira em [remotion.dev/license](https://www.remotion.dev/license)
  antes de usar em empresa.
- Fontes via Fontsource, todas SIL OFL. Ícones Lucide (ISC).
- Os efeitos da galeria têm implementação original; GSAP Demo Hub e Remotion Bits foram referência visual.
- Mídia de banco (Pexels, Pixabay) segue a licença de cada provedor. Guarde o crédito no asset.
