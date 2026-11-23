# Bancos de imagem e vídeo

## Antes de buscar: o que o banco resolve e o que não resolve

Num episódio real, de 9 clipes escolhidos pelo nome da busca, **3 serviram**. Os rejeitados traziam
logotipo de empresa, formulário de terceiro legível em tela cheia e tema errado ("loja fechada, crise
econômica" devolveu enfeite de Natal).

- O banco acerta **"pessoa fazendo X"**: alguém digitando, uma fábrica, uma rua chuvosa.
- O banco erra **conceito**: juros, confiança, crise, associação. Essas batidas viram tipografia,
  diagrama ou um dos 48 efeitos da galeria.
- B-roll genérico "de tecnologia" só para ter movimento é recusado (`docs/motion-system.md`).

## Os provedores

| Provedor | Tem | Licença | Chave | Uso aqui |
|---|---|---|---|---|
| **Pexels** | vídeo e foto | gratuita, uso comercial, sem atribuição obrigatória | grátis | `darkroom stock --provider=pexels` |
| **Pixabay** | vídeo, foto, ilustração, música | gratuita, uso comercial, sem atribuição obrigatória | grátis | `darkroom stock --provider=pixabay` |
| **Unsplash** | só foto | gratuita, uso comercial; a API exige crédito ao fotógrafo | grátis (app em modo demo: 50 req/h) | manual, para capa e foto de herói |
| **Freesound** | efeitos sonoros | **por arquivo**: CC0, CC-BY ou CC-BY-NC — confira cada um | grátis | manual |
| Arquivos públicos (Wikimedia Commons, Arquivo Nacional, Library of Congress) | foto histórica, documento | por item: domínio público, CC, ou restrito | sem chave | manual, com a página de origem guardada em `source` |

"Gratuita" não quer dizer "sem regra": nenhum deles permite revender o arquivo como está, usar
pessoa identificável de forma ofensiva ou sugerir endosso de marca que aparece na imagem. Logotipo de
empresa no quadro é motivo de descarte.

## Pegar as chaves

**Pexels**
1. Crie conta em [pexels.com](https://www.pexels.com).
2. Vá em [pexels.com/api](https://www.pexels.com/api/) → *Your API Key*, descreva o uso (ex.: "busca
   de b-roll para vídeos do meu canal") e copie a chave.
3. `.env`: `PEXELS_API_KEY=...`. Limite padrão: 200 requisições/hora, 20 mil/mês.

**Pixabay**
1. Crie conta em [pixabay.com](https://pixabay.com).
2. Com a conta logada, abra [pixabay.com/api/docs](https://pixabay.com/api/docs/): a sua chave aparece
   no texto da página, no parâmetro `key`.
3. `.env`: `PIXABAY_API_KEY=...`. Limite: 100 requisições/minuto; resultados devem ficar em cache.

**Unsplash** (opcional): [unsplash.com/developers](https://unsplash.com/developers) → *New
Application*. **Freesound** (opcional): [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply).
Esses dois não têm comando no darkroom; use o site e registre o crédito no asset.

`npm run doctor` diz se cada chave está definida, sem mostrar o valor.

## O fluxo

```bash
# 1. buscar: várias consultas, cada uma descrevendo uma AÇÃO visível
npm run darkroom -- stock "pessoa digitando no escuro" "servidor com luzes piscando" --provider=pexels --per=8 --out=meu-ep/candidatos

# 2. revisar pela miniatura (abre no navegador; ~80 KB por candidato)
open meu-ep/candidatos/candidates.html

# 3. baixar só os escolhidos e colar o trecho impresso em "assets" do episode.json
npm run darkroom -- stock --baixar meu-ep/candidatos/candidates.json pexels-123 pexels-456 --para=meu-ep/assets
```

O passo 3 imprime cada asset com `credit`, `license` e `source` já preenchidos. Antes de usar,
**assista ao clipe inteiro**: a miniatura é um frame só, escolhido pelo provedor. Procure logotipo,
texto legível, rosto em situação constrangedora e corte de câmera no meio.

## Regras que a auditoria aplica

- O mesmo asset não volta antes de 60 s (`rules.minAssetGapSeconds`). Um episódio de 8–10 minutos
  pede de 20 a 30 assets únicos.
- Arte com texto embutido (`embeddedText: true`) não recebe título por cima.
- Reduza fotos grandes a 2160 px antes do render; vídeos em 1080p bastam.

## Mídia gerada por IA

Ilustração ou reconstrução gerada vai no asset com `generated: true` e é declarada na descrição e no
campo de conteúdo alterado do YouTube. Nunca apresente imagem gerada como foto de arquivo.
