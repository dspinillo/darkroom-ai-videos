# Brand kit

Quatro documentos para preencher **antes** do primeiro episódio. Eles são a régua: quando aparecer uma
técnica nova (um post, um template, um prompt "viral"), compare com o que está escrito aqui antes de
adotar. Os dois canais de origem recusaram técnica ruim rápido porque a régua já existia.

| Arquivo | Responde |
|---|---|
| `MOTION_SYSTEM.md` | o que se move, quanto, e o que é proibido |
| `COPY_STYLE.md` | como o canal fala, o que nunca diz |
| `VOICE_DIRECTION.md` | qual voz, qual ritmo, quais ajustes |
| tema em `src/theme/theme.ts` | cor, fonte, filtro de foto, cromo das cenas |

## Criar o tema do seu canal

1. Copie `editorial` ou `documentary` em `src/theme/theme.ts`, mude `name` e os valores.
2. Registre em `themes`, e adicione o nome ao enum `theme` em `src/core/episode.ts`.
3. Fonte nova: instale via Fontsource (`npm i @fontsource/<fonte>`) e importe em
   `src/compositions/index.ts`. Só fonte com licença que permite embarcar (OFL é o caminho seguro).
4. `npm run studio` e confira as cenas com o tema novo.
