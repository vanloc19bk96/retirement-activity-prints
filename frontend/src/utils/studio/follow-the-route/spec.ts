import type { RouteSpec } from './route'
import type { InstructionStyle, RouteMode, RouteSettings } from './types'

export const FOLLOW_THE_ROUTE_KEY = 'follow-the-route'

/** Breathing room from the safe edges — same as Maze / Grid Copy. */
export const FIELD_INSET = 16

/**
 * How one printed move reads — plain words only (no arrow glyphs: catalog
 * fonts lack them and outlined PDF exports would print a missing box).
 */
const MOVE_EXAMPLE: Record<InstructionStyle, string> = {
  arrows: 'a down arrow next to 2 means move down 2 squares',
  words: 'Down 2 means move down 2 squares',
}

/** Page how-to: start rule + what a move means + what to write/mark. */
export function pageInstruction(mode: RouteMode, style: InstructionStyle): string {
  const example = MOVE_EXAMPLE[style]
  if (mode === 'route') {
    return `Start on the dot and finish on the square. Write the moves that get you there (for example, ${example})`
  }
  const finish =
    mode === 'coordinate'
      ? 'then write the coordinate of the square you land on'
      : 'then shade the square you land on'
  return `Start on the dot. Follow each numbered move in order (${example}), ${finish}`
}

/**
 * Least distance between the markers when the reader has to invent the route.
 * Four squares off both axes means no answer shorter than two moves exists.
 */
const MIN_WRITE_ROUTE_DISTANCE = 4

/** Resolved settings -> the knobs the route engine takes. */
export const routeSpec = (settings: RouteSettings): RouteSpec => ({
  rows: settings.rows,
  cols: settings.cols,
  numSteps: settings.numSteps,
  maxStepLen: settings.maxStepLen,
  diagonals: settings.diagonals,
  ...(settings.mode === 'route'
    ? { minEndManhattan: MIN_WRITE_ROUTE_DISTANCE, requireEndOffAxis: true }
    : {}),
})
