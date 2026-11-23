# Lições

O que custou caro descobrir nos dois canais de origem. Cada item tem medida ou caso concreto: lição
sem número não sobrevive à próxima pessoa que discordar dela. Quando a lição virou código, o arquivo
está indicado.

- **Canal A**: análise em PT-BR, 5–10 min + Shorts, b-roll em vídeo, motor ao vivo.
- **Canal B**: minidocumentário em inglês, 12–25 min, arquivo e fotos, motor de stills.

---

## Imagem

### Teste verde não vê a tela

Nenhum defeito visual do Canal A apareceu em teste. Todos apareceram quando alguém olhou um frame:

| Defeito | Por que só a tela revelaria |
|---|---|
| legenda cobrindo o gráfico | o contrato validava; a composição brigava |
| `19` no lugar de `19%` | o tokenizador descartava o símbolo em silêncio |
| régua de acento órfã | 56 dos 80 cortes não tinham texto, e ela era desenhada assim mesmo |
| piscada preta em todo corte | brilho 128 → **8** → 125 em três frames |
| frase do cartão final sem sentido | sintaticamente perfeita, editorialmente vazia |

158 testes garantiam que o contrato não quebrava. Nenhum deles tinha como saber que uma frase não
comunica. A piscada preta ficou escondida **por semanas** porque toda amostragem caía no meio dos
planos, nunca na fronteira entre dois.

**Regra:** nenhuma fatia de vídeo fecha sem alguém olhar frames, e olhar onde não se pensa em olhar.
**No código:** `darkroom qa` gera `qa-fronteiras.jpg` (frame antes, no corte e depois de cada
corte) e roda o scanner de piscadas em todos os frames (`src/qa/frame-spikes.ts`).

### O navegador que pisca

No Canal B, o vídeo decodificava sem erro e mesmo assim o frame 108 saiu preto e o 132 em mosaico:
**15 anomalias em 2.595 frames**, com Chrome desktop. O mesmo trecho no Chrome Headless Shell nativo
ARM64 saiu limpo. Versão, arquitetura e modo headless mudaram juntos no teste; a causa exata ficou sem
isolar, e não vale afirmar uma.

**Regras:** nunca renderizar com o Chrome pessoal; versão do navegador no manifesto; Node nativo da
arquitetura (Node x64 sob Rosetta faz o Remotion baixar navegador x64). **No código:**
`src/render/browser.ts`, aviso no `doctor`.

### Arte com título e título do componente não coexistem

O episódio passou no contrato e abriu com duas manchetes: o PNG já dizia o título e a cena desenhava
outro por cima. Reapareceu no encerramento com a thumbnail.

**Regra:** asset com texto embutido é thumbnail, não mídia de cena que recebe título. **No código:**
`embeddedText: true` no asset faz a auditoria recusar cenas com título por cima.

### Still sem texto vira cartão vazio

Só o primeiro corte de uma seção ganhava texto; cortes seguintes com still desenhavam a moldura do
cartão **sem cópia**. Um retângulo vazio aos 8:02 do episódio.

**No código:** o schema exige o texto de cada cena; cena sem copy não existe.

### Uma lista curta de visuais roda em círculo

Cada seção escolhia mídia com `visuais[corte % visuais.length]`. Uma seção de 44 s com 3 visuais
mostrava o mesmo clipe **3 vezes**. O QA de fronteiras estava verde; a repetição ficou óbvia
assistindo em tempo real. O episódio foi refeito de **96 para 74 cenas**.

**Regra:** QA de corte acha piscada; não mede fadiga de repetição. **No código:** a auditoria recusa
um asset que volta em menos de 60 s (`rules.minAssetGapSeconds`).

### Escolher b-roll por metadado não funciona

De 9 candidatos escolhidos pelo nome da consulta, **3 serviram**. Entre os rejeitados: formulário de
terceiro legível em tela cheia, prédio com logotipo de operadora, enfeite de Natal devolvido por
"loja fechada, crise econômica".

O banco de imagem acerta "pessoa fazendo X" e erra conceito. Juros, crise e associação não existem
como imagem: essas batidas são tipografia ou diagrama. Revise pela miniatura: o pool inteiro custa
~25 MB de preview contra centenas de MB de vídeo. O finalista ainda merece um olhar no clipe.
**No código:** `darkroom stock` gera a folha de contato e não baixa nada.

### Recompor a pessoa recortada parece fundo verde

Para pôr texto atrás de uma pessoa, a primeira versão recortou a pessoa e a sobrepôs ao próprio
vídeo: contorno escuro em toda a silhueta (alfa pré-multiplicado + reencode com perda). Quem viu
identificou na hora.

**Regra:** se o pixel original deve aparecer na saída, não passe ele por um codec de novo. Mascare o
que está por cima (o texto), não o que está embaixo.

### Percentual absoluto não leva sinal

Um dado de 100 → 80 foi formatado como `+80%`, sugerindo aumento. **No código:** `percent` é
absoluto (`80%`); `index` é variação assinada contra a base (`−20%`), com o sinal de menos
tipográfico (`src/core/format.ts`).

### Shorts precisam reservar a interface do YouTube

A legenda caía onde o YouTube desenha título, canal e botões. A correção medida reservou **320 px**
no rodapé e pôs a faixa de legenda de 260 px logo acima. **No código:** `safeArea()` em
`src/theme/theme.ts`; o demo `short` mostra.

---

## Tempo

### Tempo de cena vem da fala, não do storyboard

O storyboard estimou "07:20, cinco saídas". A narração chegou ao "Primeiro…" **1 min 20 s antes**: a
voz contava 3, 4, 5 enquanto a tela mostrava outra coisa. **No código:** cena é ancorada em
`{ "block", "phrase" }` e o tempo sai do alinhamento (`src/core/timeline.ts`).

### Duplicar um regex é esconder um defeito nele

O tokenizador da fala existia em dois arquivos que precisavam ser idênticos. A obrigação de manter os
dois iguais fez ninguém questionar o conteúdo: ele descartava **9 símbolos de porcentagem, 6 pares de
aspas e 1 travessão**. «a manchete "a IA acabou com os empregos" não é sustentada» virava «a manchete
a IA acabou com os empregos», que afirma o contrário. **No código:** palavra é tudo entre espaços,
numa função só, com teste de zero perda de caractere.

### O plano de blocos precisa cobrir o vídeo inteiro

O script dividia `total = 551,2` s, mas o cartão final vivia em 551,2 → 556,2. O render terminou com
sucesso e entregou um arquivo **incompleto** sem nada acusar. **No código:** `planChunks()` deriva do
total; `validateSceneCoverage()` falha em buraco ou sobra; o QA confere a contagem de frames.

### Juntar AAC por bloco acumula atraso

Blocos de 1800 frames tinham vídeo de 60,000 s e áudio de 60,053 s. Concatenar os MP4 deu **489,152 s
para uma timeline de 488,667 s**. **No código:** blocos saem sem áudio; o áudio master é codificado
uma vez no fim. Não mascare aumentando tolerância.

### Base de tempo misturada desloca a cena

Segmentos com `time_base 1/90000` e `1/15360`, todos a 30 fps, concatenados direto: aos 700 s um plano
apareceu sem a inscrição esperada, com contagem de frames e duração aparentemente corretas. **No
código:** todo segmento sai em 1/90000, cada pacote é conferido no passo exato, o ffconcat declara a
duração de cada arquivo, e o QA compara cada segmento com o vídeo montado.

Ausência de piscada não prova que a cena entrou na hora certa. Contagem de frames certa também não.

---

## Render

### Render longo não pode ser filho de sessão interativa

Quatro renders morreram com SIGKILL limpo: sem crash report, sem jetsam, sem sono. Duração não era o
discriminador (27 min sobreviveu, 8 min morreu, e o par 8m01s morto / 8m03s vivo). O assassino nunca
foi identificado e deixou de importar: **destacado**, o mesmo render atravessou 89 minutos e passou a
deixar log. Num caso, até o `nohup` de um agente de IA matou o filho em 0%; num Terminal comum o mesmo
bloco fechou em 3 min.

**No código:** `darkroom render --detach` (processo destacado, log em arquivo, pid salvo), render em
blocos com retomada, e limpeza de Chrome órfão antes de cada render — sem isso o próximo trava em 0%.

### `gl: angle` contra `swangle`: 3,2×

`swangle` é rasterização em CPU. Medido em 600 frames de 1080p30 num MacBook Air M2:

| `gl` | frames/min |
|---|---:|
| `swangle` | 279 |
| `angle` (Metal) | **600** |

Imagem equivalente (PSNR 51,5 dB na luminância). O episódio de 9 min caiu de ~89 para ~28 min.
Concorrência **não** é a alavanca: 4 rendeu 3% e 8 **piorou 31%**.

Armadilha de medição: benchmark que silencia o stderr transforma falha em número plausível. Um render
que abortou em 1 s por schema inválido virou "piso de 1 s" até alguém conferir.

### Foto em resolução cheia e TMPDIR no SSD

80 fotos de câmera em resolução cheia estimaram 1 h de render; reduzidas a 2160 px, ~4 min. E o
perfil do Chrome vive no TMPDIR: um render longo escreveu **137 GB em 19,5 h** no SSD interno.
**No código:** `RENDER_TMPDIR` para disco externo; reduza assets antes (`sips -Z 2160` no macOS).

### Cache que não sabe o que mudou entrega o vídeo velho

No Canal B, o render recusava continuar se as entradas tivessem mudado depois dos primeiros
segmentos. Ao construir este repositório, a primeira versão do cache de blocos olhava só as props do
episódio: uma correção no código de uma cena (título batendo na legenda do Short) e um asset
regerado (fractal com outra cor) **não mudaram o vídeo**, porque blocos, stills e o link do asset
antigos foram reaproveitados. O QA técnico passou nos dois casos; só olhar os frames mostrou.

**No código:** o hash do plano cobre props, motor, código das cenas e tamanho/data de cada asset;
o diretório público troca o asset quando a origem muda.

### Nunca sobrescreva uma entrega

Versão nova em arquivo novo; a anterior fica para comparar. **No código:** `-v1`, `-v2`… automático.

---

## Voz

### Métrica não substitui escuta

Uma voz passou na triagem de altura e nível e foi rejeitada na escuta por **mudança de timbre** no
meio. Amostra curta aprovada também não valida uma narração inteira: confira início, meio, fim,
plosivas (P/B) e palavras difíceis da tomada longa. Pico seguro medido não descarta distorção já
sintetizada.

### Instrução de TTS empilhada vira lentidão

Dirigindo um TTS por prompt, o pedido somava "pausado e deliberado" + "120 palavras por minuto" +
"pausas de quase um segundo" + "nunca apressado". O modelo somou tudo: **70 ppm** contra 119 do
original. Tirar as pausas piorou, porque a lentidão vinha de seis descritores de baixa energia. O
prompt que acertou (152 ppm) tinha **uma** linha de ritmo e nenhuma instrução de pausa.

**Regra:** ritmo instruído uma vez; pausa dramática inserida em pós, exata e repetível.

### O formato da pergunta comanda a entonação

Medido em PT-BR: uma pergunta cuja palavra interrogativa cai depois de ~60 caracteres desce até o fim
e soa como afirmação (−5,5 semitons); quebrada em duas frases, sobe (+8,3). Terminar em `?”.` achata a
subida. Ver [`voz.md`](voz.md).

### Voz por bloco, com cache

Narração numa tomada só torna toda correção uma nova rolagem de dado e um novo custo. **No código:**
cada bloco tem cache endereçado por provedor + voz + modelo + ajustes + texto; voz paga só com `--live`;
o `plan` mostra quantos caracteres faltam antes de gastar.

---

## Editorial

### Divergir antes de escolher

Nos primeiros episódios, o título foi escrito com uma opção e três alternativas no mesmo fôlego, e a
thumbnail era uma só. Nada foi comparado. A regra que ficou: **12 títulos em 4 eixos, 3 thumbnails**,
e o teste nativo do YouTube decide. Ver [`publicacao.md`](publicacao.md).

### O que o modelo não mede, o YouTube mede

"Pontue estes títulos por potencial de CTR" pede uma previsão que o modelo não tem como fazer. Pedir
ranking de CPM por nicho ou "duração ideal" devolve número inventado com cara de fato.

### Importar técnica sem ler a marca

Um post com "9 prompts para monetizar o YouTube" trazia um eixo de urgência — exatamente o que o guia
de texto do canal já recusava por escrito ("FAÇA ISSO ANTES QUE SEJA TARDE"). A ideia aproveitável cabia
em uma frase. Antes de importar técnica, releia `brand-kit/MOTION_SYSTEM.md` e `COPY_STYLE.md`.

### Técnica boa que não se paga

Tipografia cinética palavra a palavra passando por trás da pessoa funcionou tecnicamente: motion
medido frame a frame, recorte por segmentação, tempo derivado do alinhamento. Foi **descartada** pelo
custo recorrente: segmentar cada corte, escolher âncora à mão em cada batida, manter máscara por corte.
Trabalho de edição num pipeline que existe para não abrir editor.

### Reconstrução por IA não se passa por arquivo

No Canal B, procedência e licença de cada asset ficam registradas, e material gerado nunca é
apresentado como evidência histórica. Selos na tela ("AI RECONSTRUCTION") foram tirados a pedido do
dono do canal; a transparência ficou na descrição e na declaração de IA do upload.

### Aprovação humana tem hash

Os dois canais amarram aprovação a uma versão exata: roteiro aprovado é o roteiro daquele hash; mudou
uma vírgula, aprova de novo. O vídeo aprovado é o MP4 daquele SHA-256. O `render-manifest.json`
guarda o hash e começa com `humanReviewed: false`.

### Chaves no histórico do git

Um dos canais teve o `.env` rastreado no git por semanas; as chaves de voz, banco de imagem e YouTube
ficaram no histórico do GitHub e precisaram ser rotacionadas. Tirar do rastreio não apaga o passado.
**Regra:** `.gitignore` antes do primeiro commit, e varredura de segredo antes de publicar.
