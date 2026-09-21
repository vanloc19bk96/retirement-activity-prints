import { cellCode, simulateRoute } from './route'
import {
  DIR_WORDS,
  type InstructionStyle,
  type Route,
  type RouteMode,
  type Step,
} from './types'

/** Label beside the Mode B write-in rule. NBSP — Fabric soft-wraps at regular spaces. */
export const END_SQUARE_LABEL = 'End\u00a0square:'

/** THE answer for Modes A and B, as printed on the key (e.g. `C4`). */
export function endCoordinate(route: Route): string {
  return cellCode(route.end)
}

/**
 * The text half of one printed move. The arrow, when the style asks for one, is
 * drawn as line art beside this — catalog fonts have no arrow glyphs, and an
 * outlined PDF export would print the missing-glyph box.
 */
export function stepText(step: Step, style: InstructionStyle): string {
  return style === 'arrows'
    ? String(step.count)
    : `${DIR_WORDS[step.dir]} ${step.count}`
}

/** Whether the style draws an arrow beside the text. */
export const stepHasArrow = (style: InstructionStyle): boolean => style !== 'words'

/** The route spelled out on one line — used by the key and by tests. */
export function sampleRouteText(route: Route, style: InstructionStyle): string {
  return route.steps
    .map((step) => (style === 'arrows' ? `${step.dir} ${step.count}` : stepText(step, style)))
    .join(', ')
}

/**
 * Mode C sample answer: the generated walk (`numSteps` moves). Blank lines on
 * the sheet match this length one-for-one — never pad past the answer, never
 * leave a blank without a filled key slot.
 */
export function sampleRouteSteps(route: Route): Step[] {
  return route.steps
}

/** True when the sample route printed on the key really lands on the square. */
export function sampleRouteLandsOnEnd(route: Route): boolean {
  const end = simulateRoute(route.start, sampleRouteSteps(route))
  return end.row === route.end.row && end.col === route.end.col
}

/** The end square is the reader's job in Modes A and B; Mode C prints it. */
export const endIsAnswer = (mode: RouteMode): boolean => mode !== 'route'
