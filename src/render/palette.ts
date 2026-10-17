// Colour palettes for the canvas renderer. Keep in sync with src/styles/theme.css.
export type Theme = 'light' | 'dark'
export type RGB = readonly [number, number, number]

export interface Palette {
  // shading targets: never pure black / white
  shadeMix: RGB
  lightMix: RGB
  shadowInk: RGB
  shadowAlpha: number
  // fabric inside the hoop
  tautTint: string
  rimShadow: string
  holeShade: string
  holeShadow: string
  holeRim: string
  ring: RGB // empty-cell ring thread
  // wood + brass
  wood: RGB
  woodLight: RGB
  woodDark: RGB
  grain: RGB
  brass: RGB
  brassLight: RGB
  brassDark: RGB
  // pieces
  p1: RGB
  p2: RGB
  win: RGB
}

export const PALETTE: Record<Theme, Palette> = {
  light: {
    shadeMix: [38, 24, 14],
    lightMix: [255, 252, 244],
    shadowInk: [58, 40, 22],
    shadowAlpha: 0.32,
    tautTint: 'rgba(255, 253, 246, 0.22)',
    rimShadow: 'rgba(70, 45, 20, 0.34)',
    holeShade: 'rgba(120, 95, 60, 0.1)',
    holeShadow: 'rgba(70, 48, 24, 0.55)',
    holeRim: 'rgba(255, 252, 244, 0.75)',
    ring: [146, 126, 104],
    wood: [201, 150, 92],
    woodLight: [238, 200, 146],
    woodDark: [128, 84, 44],
    grain: [110, 66, 30],
    brass: [196, 156, 78],
    brassLight: [250, 226, 160],
    brassDark: [118, 84, 30],
    p1: [201, 65, 59],
    p2: [226, 166, 47],
    win: [70, 122, 92],
  },
  dark: {
    shadeMix: [10, 12, 22],
    lightMix: [250, 246, 236],
    shadowInk: [6, 8, 18],
    shadowAlpha: 0.5,
    tautTint: 'rgba(150, 170, 230, 0.05)',
    rimShadow: 'rgba(4, 6, 14, 0.6)',
    holeShade: 'rgba(6, 8, 20, 0.2)',
    holeShadow: 'rgba(2, 4, 12, 0.7)',
    holeRim: 'rgba(170, 186, 230, 0.32)',
    ring: [118, 132, 164],
    wood: [112, 72, 44],
    woodLight: [168, 118, 78],
    woodDark: [52, 32, 20],
    grain: [36, 20, 10],
    brass: [178, 140, 70],
    brassLight: [236, 208, 140],
    brassDark: [90, 62, 24],
    p1: [228, 78, 70],
    p2: [242, 186, 66],
    win: [150, 210, 170],
  },
}
