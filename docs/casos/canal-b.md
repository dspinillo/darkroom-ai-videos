# Caso: Canal B — minidocumentário em inglês, motor de stills

## O canal

Histórias reais extraordinárias, em inglês, 12 a 25 minutos. Arquivo e fotografia como âncora de
credibilidade; ilustração gerada só para preencher lacunas, sempre identificada. Narrador sintético
fixo, trilha discreta, sem legenda queimada (SRT/VTT à parte).

## Como foi montado

- CLI com banco SQLite local, pautas com revisões imutáveis e aprovação humana amarrada ao hash.
- Registro de fontes por episódio: cada afirmação aponta para a fonte; cada asset tem procedência,
  licença e data.
- Voz por bloco (21 blocos por episódio), cache, orçamento de caracteres planejado antes de gerar.
- Render: Remotion compõe **um PNG por plano**, em camadas; FFmpeg aplica `zoompan` na foto, monta
  segmentos em 1/90000 e concatena com duração explícita. ~65 planos por episódio de 13 minutos.
- Verificação: decodificação integral, PTS de cada pacote, scanner de piscadas em todos os frames,
  loudness, e comparação de cada segmento com o vídeo montado.

## O que deu errado (e virou regra)

| Problema | Medida | Regra |
|---|---|---|
| Chrome desktop corrompendo frames | 15 em 2.595 | Chrome Headless Shell nativo, versão no manifesto |
| Node x64 baixou navegador x64 num Mac ARM | timeout ao conectar | Node nativo da arquitetura |
| base de tempo misturada | plano fora do lugar aos 700 s | tudo em 1/90000, conferido pacote a pacote |
| arredondamento do cabeçalho MP4 | 2 ticks de deriva | duração explícita no ffconcat; remux só de pacotes |
| foto reiniciando zoom quando a fala começa | descontinuidade na abertura | progressão contínua do pre-roll à primeira fala |
| selos "AI RECONSTRUCTION" em cada cena | rejeitados pelo dono | transparência na descrição e no upload |

## A dívida que ficou

Cada lote de episódios ganhou o próprio script de plano, render e verificação (mais de 80 arquivos).
Funcionou, mas cada melhoria precisava ser copiada à mão. O motor de stills deste repositório é a
versão consolidada: um episódio é dado (`episode.json`), não código novo.

## O que levar daqui

Para documentário de arquivo, renderizar cada frame no navegador é desperdício: a imagem é parada e
só a câmera anda. Separar composição (Remotion) de movimento (FFmpeg) deixa o render barato e
verificável.
