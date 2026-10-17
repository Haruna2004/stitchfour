import type { Level } from '../bot/search'

export const LEVELS: Level[] = ['easy', 'medium', 'hard']

export const LEVEL_INFO: Record<Level, { label: string; emoji: string; blurb: string }> = {
  easy: { label: 'Easy', emoji: '🌱', blurb: 'Relaxed. Makes the odd slip.' },
  medium: { label: 'Medium', emoji: '🌿', blurb: 'Thinks a few moves ahead.' },
  hard: { label: 'Hard', emoji: '🌳', blurb: 'Sharp and patient. Beatable, just.' },
}
