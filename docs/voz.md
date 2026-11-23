# Voz

## Regra zero

**Métrica não substitui escuta.** Altura, LUFS, ritmo e transcrição automática são triagem. Timbre,
eco, naturalidade e mudança de voz no meio da narração só o ouvido aprova — e uma amostra curta
aprovada não valida oito minutos. Ouça início, meio, fim e as palavras difíceis da tomada longa.

## Escolher o caminho

| Provedor | Quando | Custo | Tempo das palavras |
|---|---|---|---|
| `elevenlabs` | voz sintética de melhor qualidade em PT-BR e EN, pronta para produção | pago por caractere | medido pela própria API |
| `gravacao` | **sua voz**: você grava um arquivo por bloco | grátis | medido pelo alinhador local |
| `local` | TTS rodando no seu computador, chamado por linha de comando (mlx-audio, Chatterbox…) | grátis | medido pelo alinhador local |
| `local-api` | TTS local com API HTTP compatível com a OpenAI (VoiceStudio, mlx_audio.server) | grátis | medido pelo alinhador local |
| `say` | rascunho rápido no macOS | grátis | medido (se houver alinhador) |
| `silence` | montar o vídeo antes de existir voz | grátis | estimado |

Para gravação e TTS local, a voz passa por um tratamento antes da mistura (`polish`, ligado por
padrão): nivelamento em -20 LUFS, passa-alta, EQ e compressor 2:1, a cadeia aprovada por escuta num
dos canais. Sem isso, a voz crua tem pico alto demais para o master em -16 LUFS — e o framework
recusa em vez de esmagar o áudio.

## Alinhador local (tempo medido sem ElevenLabs)

Legenda e âncora de cena dependem do tempo de cada palavra. Fora da ElevenLabs, o
`tools/align.py` mede esse tempo a partir do áudio e do texto do roteiro:

1. **Apple Silicon**: `pip install mlx-audio` → usa o Qwen3-ForcedAligner (0,6B). Medido num M2:
   26 s no primeiro bloco (inclui download do modelo), poucos segundos depois, 1,1 GB de RAM, 100%
   das palavras casadas em PT-BR.
2. **Qualquer CPU**: `pip install faster-whisper` → Whisper small com tempo por palavra.

```bash
python3 -m venv ~/.darkroom-venv && ~/.darkroom-venv/bin/pip install mlx-audio   # ou faster-whisper
export DARKROOM_PYTHON=~/.darkroom-venv/bin/python
```

Sem alinhador, o tempo é estimado (proporcional ao texto), o manifesto marca
`timingEstimated: true` e o QA avisa. Para desligar de propósito: `"align": "off"`.

## Gravar a própria voz

```json
"voice": { "provider": "gravacao", "recordings": "voz/{block}.wav" }
```

1. Grave um arquivo por bloco (`voz/b1.wav`, `voz/b2.wav`…), lendo exatamente o texto do bloco.
   Errou? Regrave só aquele arquivo: o cache percebe a mudança e refaz só ele.
2. Ambiente quieto, sem eco; microfone a um palmo; mesmo lugar e mesmo nível em todas as sessões.
3. WAV ou MP3, qualquer taxa: o framework converte. Não precisa cortar o silêncio das pontas com
   precisão, mas não deixe mais de meio segundo.
4. O alinhador confere palavra por palavra. Se menos da metade casar com o roteiro (você improvisou
   ou leu outro texto), o bloco cai para tempo estimado e o log avisa.

## TTS local

Tudo roda no seu computador, sem custo por caractere. Testado neste repositório num MacBook Air M2 de
24 GB:

| Ferramenta | Como usar aqui | PT-BR | Licença | Medido |
|---|---|---|---|---|
| [mlx-audio](https://github.com/Blaizzy/mlx-audio) + Qwen3-TTS 1.7B (4-bit) | `local` (exemplo abaixo) | sim | Apache 2.0 (modelo) | 9,4 s de fala em 9,7 s, pico 2,5 GB; voz criada por descrição. Texto longo de uma vez não encerrou: por isso a geração é por bloco |
| [VoiceStudio](https://github.com/debpalash/voicestudio) | `local-api` em `http://localhost:3900/v1/audio/speech` | sim (646 idiomas) | app AGPL-3.0; **pesos padrão (OmniVoice) CC-BY-NC: não comerciais** | não testado aqui; o cliente HTTP foi testado contra um servidor no mesmo formato |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) Multilingual | `local` | sim | MIT | no M2, via MPS, passou de 27 GB de memória e foi interrompido; em CPU funciona, devagar |
| Pocket TTS (Kyutai), Kokoro | `local` | não / limitado | CC-BY 4.0 / Apache 2.0 | rápidos em CPU, sem português |

**Canal monetizado é uso comercial.** Antes de usar uma voz local em produção, confira a licença dos
**pesos** do modelo, não só a do app. No VoiceStudio, troque o motor padrão por um de licença
comercial no gerenciador de modelos.

**Clonagem de voz:** só a sua, ou de alguém que autorizou por escrito.

### Exemplo: mlx-audio com Qwen3-TTS

```json
"voice": {
  "provider": "local",
  "command": ["/caminho/venv/bin/python", "-m", "mlx_audio.tts.generate",
    "--model", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit",
    "--text", "{text}",
    "--instruct", "Narrador brasileiro adulto, voz grave e calma, tom de documentário, ritmo constante.",
    "--lang_code", "pt", "--output_path", "{dir}", "--file_prefix", "bloco", "--audio_format", "wav"]
}
```

O comando recebe `{text}` (o bloco) e `{dir}` (uma pasta vazia) e precisa escrever **um** arquivo de
áudio nela. Qualquer TTS de linha de comando serve.

Voz criada só por descrição pode variar de timbre entre blocos. Ouça o episódio inteiro; para timbre
fixo, use um modelo com voz de referência (clonagem da sua própria voz).

### Exemplo: VoiceStudio

Instale pelo site oficial, abra o app e descubra as vozes em `GET http://localhost:3900/v1/audio/voices`.

```json
"voice": { "provider": "local-api", "endpoint": "http://localhost:3900/v1/audio/speech",
  "voiceId": "<id de uma voz salva>", "model": "tts-1" }
```

`model` e `voice` seguem o formato da API da OpenAI; campos extras vão em `"body": { … }`.

## ElevenLabs

### Conta e chave

1. Crie a conta em [elevenlabs.io](https://elevenlabs.io). O plano gratuito **não permite uso
   comercial** e exige atribuição; para canal monetizado, o plano pago mais barato já libera.
2. Escolha a voz na Voice Library ou em "My Voices"; o **Voice ID** aparece nos detalhes da voz.
3. Gere a chave em *Developers → API Keys*. Dê só a permissão de Text to Speech (e de leitura de
   uso, se quiser conferir saldo).
4. No `.env` do projeto: `ELEVENLABS_API_KEY=...`. No episódio:

```json
"voice": { "provider": "elevenlabs", "voiceId": "<Voice ID>", "model": "eleven_multilingual_v2" }
```

5. `darkroom plan` mostra quantos caracteres faltam no cache; `darkroom render --live` gasta.

O provedor `elevenlabs` usa `/with-timestamps`: áudio e tempo por caractere numa chamada só. Esse
tempo alimenta legendas e âncoras de cena; não precisa de alinhador.

### Ajustes que fizeram diferença

Os dois canais começaram mandando só texto e modelo — tudo no padrão de fábrica. O que mudou:

| Ajuste | Efeito medido |
|---|---|
| `stability` 0,5 → 0,30 | entrega menos "robótica"; faixa de altura foi de 2,3 para 2,5 semitons, nenhum salto acima de 3 st em 34 frases |
| `style` 0,45 + `use_speaker_boost` | mais caráter, mesmo timbre |
| `speed` 0,93 (narrador de documentário) | ritmo mais imersivo; preferido na escuta contra versões mais novas do modelo |

Os números ótimos dependem da voz. Teste com um trecho de 15 s, depois confirme num bloco longo.

### Pausas

O ponto final já produz ~**0,72 s** de pausa. Medido na mesma frase:

| Tag | Pausa real |
|---|---:|
| nenhuma | 0,72 s |
| `<break time="0.5s" />` | 0,74 s (tag menor que a pausa natural é ignorada) |
| `<break time="0.9s" />` | 1,20 s (rejeitada de ouvido: arrastada) |

Pausa dramática maior? Insira silêncio na pós (`gapSeconds` entre blocos, ou edição do WAV): exato,
repetível e sem derrubar a energia da fala.

## Redação para TTS

### Perguntas

Medido em PT-BR com a mesma voz (inclinação final da entonação):

| Forma | Final | Soa como |
|---|---:|---|
| `A pergunta passa a ser: se a máquina faz o trabalho de iniciante, onde o próximo profissional vai aprender a profissão?` | −5,5 st | afirmação |
| `A pergunta passa a ser outra. A máquina faz o trabalho de iniciante. Então onde o próximo profissional vai aprender?` | +8,3 st | pergunta |
| `…deixa de ser “a IA vai substituir todo mundo?”.` | +1,4 st | quase plana |
| `…deixa de ser: a IA vai substituir todo mundo?` | +12,1 st | pergunta |

- Palavra interrogativa cedo: depois de ~60 caracteres o modelo não tem pista para subir.
- Nunca termine em `?”.` — o ponto final vence e achata.
- Uma pergunta por frase, até ~90 caracteres.
- Em português, pergunta com `onde/qual/como` desce (correto). Quer que o ouvinte **sinta** pergunta?
  Escreva uma de sim/não: "Ainda sobra onde aprender a profissão?"

### TTS por instrução (modelos que aceitam prompt de estilo)

- Instrução em prosa antes do texto; tags inline variam a cada tomada.
- **Uma** linha de ritmo para o roteiro inteiro. Seis descritores de calma ("sério", "contido",
  "estável", "discreto"…) somados deram 70 palavras/min contra 150 pedidas. Tom e velocidade são um
  botão só para o modelo.
- A escolha da voz pesa mais que o prompt. Comece pelas de perfil "informativo/firme".
- Um modelo passou na triagem de altura e nível e foi rejeitado por mudar de voz no meio. Por isso
  a regra zero.

## Pós-produção da voz

Receita aprovada num dos canais (voz com leve eco de sala):

1. Isolador de voz (o da ElevenLabs serve).
2. Ganho constante até ~-20 LUFS de entrada: o limiar do compressor depende do nível.
3. Cadeia FFmpeg:

```
highpass=f=65:p=2,
equalizer=f=320:t=q:w=0.9:g=-2.5,
equalizer=f=750:t=q:w=1.1:g=-1.5,
acompressor=threshold=0.1:ratio=2:attack=15:release=140:knee=2.82843:makeup=1:detection=rms
```

4. Guarde o bruto, o isolado e o processado separados. Confira duração e tempo depois de cada etapa.

É essa cadeia (mais um limitador leve) que o `polish` aplica. Para ElevenLabs ela vem desligada; ligue
com `"polish": true` se a voz tiver eco. O master final (`src/render/audio.ts`) só aplica ganho
constante até -16 LUFS e recusa se precisar de mais que isso sem estourar o pico.

## Custo

- Voz paga só com `--live`. `darkroom plan` mostra antes quantos blocos e caracteres faltam no cache.
- Cache por bloco: mudou uma frase, paga um bloco.
- Uma chave por projeto, no `.env` do projeto. Se a conta que paga é outra, troque a variável — nunca
  caia em silêncio numa chave "geral" de outro lugar.
