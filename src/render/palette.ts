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
  winScale: number // belt thickness multiplier
  dimAlpha: number // opacity of non-winning pieces after a win
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
    win: [120, 99, 76], // --thread-win: ring thread, a touch deeper
    winScale: 1,
    dimAlpha: 0.45,
  },
  dark: {
    // walnut linen (ported from fabricman): warm brown cloth, oatmeal cord rings, deeper warm shadows
    shadeMix: [14, 9, 5],
    lightMix: [255, 244, 226],
    shadowInk: [8, 5, 2],
    shadowAlpha: 0.51, // light 0.32 x 1.6
    tautTint: 'rgba(255, 226, 190, 0.035)',
    rimShadow: 'rgba(8, 5, 2, 0.6)',
    holeShade: 'rgba(14, 9, 5, 0.2)',
    holeShadow: 'rgba(8, 5, 2, 0.72)',
    holeRim: 'rgba(255, 232, 200, 0.2)',
    ring: [184, 166, 136], // oatmeal cord, toned down so 42 rings don't shout
    wood: [128, 84, 50],
    woodLight: [176, 124, 80],
    woodDark: [56, 34, 18],
    grain: [42, 24, 10],
    brass: [184, 146, 72],
    brassLight: [240, 214, 150],
    brassDark: [96, 66, 24],
    p1: [220, 76, 64],
    p2: [248, 190, 62],
    win: [224, 204, 168], // --thread-win: ring thread, a touch brighter so it reads on walnut
    winScale: 1.1,
    dimAlpha: 0.6, // 0.45 turns gold muddy on brown
  },

}
