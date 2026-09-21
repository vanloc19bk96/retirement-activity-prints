import { hasPhosphorIcon } from '../studio-phosphor-icon'

/**
 * Geometric Phosphor duotone icons for N-Back Paper shapes mode.
 * Same fill/stroke paint as Change Detection (`#D6D6D6` / `#4B4B4B`).
 */
const N_BACK_SHAPE_ICONS = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'star-four',
  'plus',
  'cross',
  'x',
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'arrow-up-left',
  'arrow-up-right',
  'arrow-down-left',
  'arrow-down-right',
  'arrow-fat-up',
  'arrow-fat-down',
  'arrow-fat-left',
  'arrow-fat-right',
  'caret-up',
  'caret-down',
  'caret-left',
  'caret-right',
] as const

export const N_BACK_SHAPES: readonly string[] = N_BACK_SHAPE_ICONS

for (const name of N_BACK_SHAPES) {
  if (!hasPhosphorIcon(name)) {
    throw new Error(`n-back-paper: missing Phosphor duotone icon "${name}"`)
  }
}

export function isNBackIconSymbol(symbol: string): boolean {
  return hasPhosphorIcon(symbol)
}
