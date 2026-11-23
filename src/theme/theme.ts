/**
 * Tema = a marca do canal. Cor, fonte e respiro moram aqui e em nenhum outro lugar: a cena pede
 * "acento", o tema responde qual. Troque o tema e o mesmo episódio sai com outra cara.
 *
 * Para criar o seu: copie um dos dois abaixo, mude os valores e registre em `themes`.
 */

export interface Theme {
  name: string;
  colors: {
    bg: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
    line: string;
    /** Papel claro para documentos e relatórios dentro da cena. */
    paper: string;
    paperInk: string;
  };
  fonts: { display: string; body: string; mono: string };
  display: { weight: number; tracking: number; uppercase: boolean };
  /** Filtro aplicado a fotos e b-roll para casar com a paleta. */
  photoFilter: string;
  /** `documentary` desenha barra superior com o canal e linha de crédito embaixo em toda cena. */
  chrome: "minimal" | "documentary";
}

export const editorial: Theme = {
  name: "editorial",
  colors: {
    bg: "#0b0b0c",
    surface: "#18181a",
    ink: "#f2efe9",
    muted: "#9b9995",
    accent: "#ff6b3d",
    line: "#333230",
    paper: "#f2efe9",
    paperInk: "#141414",
  },
  fonts: {
    display: '"Space Grotesk", "Helvetica Neue", sans-serif',
    body: '"IBM Plex Sans", "Helvetica Neue", sans-serif',
    mono: '"IBM Plex Mono", Menlo, monospace',
  },
  display: { weight: 700, tracking: -0.03, uppercase: false },
  photoFilter: "saturate(.9) contrast(1.02)",
  chrome: "minimal",
};

export const documentary: Theme = {
  name: "documentary",
  colors: {
    bg: "#111b1b",
    surface: "#172624",
    ink: "#e9e1cf",
    muted: "#b5c0ba",
    accent: "#c9a26b",
    line: "#415452",
    paper: "#e9e1cf",
    paperInk: "#142221",
  },
  fonts: {
    display: '"Barlow Condensed", "Arial Narrow", sans-serif',
    body: '"IBM Plex Sans", "Helvetica Neue", sans-serif',
    mono: '"IBM Plex Mono", Menlo, monospace',
  },
  display: { weight: 600, tracking: 0.005, uppercase: true },
  photoFilter: "saturate(.78) brightness(.91)",
  chrome: "documentary",
};

export const themes = { editorial, documentary } as const;
export type ThemeName = keyof typeof themes;

/**
 * Área segura por formato. No 9:16 a interface do YouTube cobre os ~320 px de baixo (título,
 * canal, botões): legenda posta ali some. Medido num Short real.
 */
export function safeArea(width: number, height: number) {
  const portrait = height > width;
  return portrait
    ? { portrait, x: 72, top: 180, bottom: 320, captionBand: 260 }
    : { portrait, x: 96, top: 60, bottom: 60, captionBand: 156 };
}
