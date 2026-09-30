import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { SKY_CITIES, skyLevelSpec, skySignText, type SkyBookEntry, type SkyCity, type SkyLevel } from './content'
import { SKY_PART_KEY, skyLegendBox, skySignBox } from './draw'
import { SKY_DIGIT_MIN, SKY_SIGN_GAP_MIN, SKY_SIGN_MIN, SKY_SIGN_PAD_X, skyBandFor, skySignSpec, skyTextWidth, type SkyPlan } from './layout'
import { skyCluesPerSide, skySignature, type SkyBuilt } from './puzzle'
import { isSkySolution, skyAnswerKey, skyWellFormed, solveSky } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Skyline Tour page is accepted.
 *
 * A city with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the city is
 * proven, not trusted: the answer must hold every height once in every row
 * and column, match every clue and every given plot; the level's own steps,
 * used the way a reader would, must finish the city on exactly that answer
 * (which also proves it is the only one) — and the easier steps alone must
 * not, where the level asks for more; few plots handed over, and a clue on
 * every side. Then the page: plots at least the level's floor, clues and
 * heights at least 16 pt, the skyline's name inside its board, everything
 * on the printable panel with air between; and not a skyline the book
 * already uses while others wait, nor a city the book already prints.
 */
export function runSkyKdpPreflight(options: {
  built: SkyBuilt
  plan: SkyPlan
  level: SkyLevel
  city: SkyCity
  panel: Box
  font: string
  book?: readonly SkyBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, city, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = skyLevelSpec(level)
  const { puzzle, grid } = built

  // The city.
  if (puzzle.size !== spec.size) errors.push(`The city is not ${spec.gridLabel}.`)
  if (!skyWellFormed(puzzle)) errors.push('The city has a clue or a plot out of range.')
  else {
    if (puzzle.givens.filter((v) => v > 0).length > spec.maxGivens) errors.push('The city hands over too many plots for this level.')
    if (skyCluesPerSide(puzzle).some((k) => k < spec.minCluesPerSide)) errors.push('A side of the city has no clue.')
    if (!isSkySolution(puzzle, grid)) errors.push('The answer breaks a rule.')
    else {
      const solve = solveSky(puzzle, spec.rules)
      if (!solve.solved || skyAnswerKey(solve.grid) !== skyAnswerKey(grid)) errors.push('The city cannot be finished by logic alone to its one answer.')
      else if (spec.beyond && solveSky(puzzle, spec.beyond).solved) errors.push('The city is too easy for this level.')
    }
    if (skySignature(puzzle) !== built.signature) errors.push('The city’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The plots print smaller than this level allows.')
  if (plan.digitSize < SKY_DIGIT_MIN - 1e-6) errors.push('The clues print below 16 pt.')
  if (plan.band < skyBandFor(plan.cell) - 1e-6) errors.push('The clues are crowded against the city.')
  if (plan.signSize < SKY_SIGN_MIN - 1e-6) errors.push('The name board prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The city is not the level’s size.')
  const sign = skySignBox(plan, city, font)
  if (skyTextWidth(skySignText(city, plan.signLines), plan.signSize, skySignSpec(font)) > sign.width - SKY_SIGN_PAD_X + 0.5) errors.push(`“${city.name}” does not fit on its board.`)
  const legend = skyLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The name board'],
    [legend, 'The legend'],
    [plan.city, 'The city'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + SKY_SIGN_GAP_MIN > plan.city.top + 0.5) errors.push('The name board crowds the clues.')
  if (legend.top < plan.city.top + plan.city.height + 12) errors.push('The legend crowds the clues.')

  // The book.
  const used = new Set(book.map((e) => e.city))
  if (used.has(city.id) && SKY_CITIES.some((c) => !used.has(c.id))) errors.push(`The book already uses ${city.name} while other skylines wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this city.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

const hiddenAnswer = (o: StudioFabricObject) => o.visible === false && o.studioRole === 'answer'

/**
 * The drawn page (the puzzle's, or the answer page's), checked against the
 * city it was drawn from: every clue beside its row or column and no other,
 * every given plot, the frame, the answer's height waiting, hidden, on
 * every plot not given, the board naming the skyline, and the legend
 * showing the heights and a sample clue.
 */
export function checkSkyDrawnPage(options: { puzzle: StudioFabricObject; built: SkyBuilt; city: SkyCity }): string[] {
  const { puzzle: group, built, city } = options
  const { puzzle, grid } = built
  const n = puzzle.size
  const errors: string[] = []
  const clues = new Map<number, number>()
  const givens = new Map<number, number>()
  const heights = new Map<number, number>()
  let frame = 0
  let sign: StudioFabricObject | null = null
  let legendHeights: number | null = null
  let legendClue = 0
  walk(group, (o) => {
    const role = String(o.data?.[SKY_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'clue') {
      const k = Number(o.data?.k)
      if (clues.has(k)) errors.push('A clue is drawn twice.')
      clues.set(k, Number(o.text))
      if (o.visible === false) errors.push('A clue is hidden on the puzzle page.')
    } else if (role === 'given') {
      if (givens.has(at)) errors.push('A given plot is drawn twice.')
      givens.set(at, Number(o.text))
      if (o.visible === false || o.studioRole === 'answer') errors.push('A given plot is hidden on the puzzle page.')
    } else if (role === 'frame') frame++
    else if (role === 'height') {
      if (!hiddenAnswer(o)) errors.push('The answer’s heights show on the puzzle page.')
      if (heights.has(at)) errors.push('A height is drawn twice.')
      heights.set(at, Number(o.text))
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.heights !== undefined) legendHeights = Number(o.data.heights)
    else if (role === 'legend-clue') legendClue++
  })

  const cluesWanted = new Map(puzzle.clues.flatMap((v, k) => (v > 0 ? [[k, v] as const] : [])))
  if (clues.size !== cluesWanted.size || [...cluesWanted].some(([k, v]) => clues.get(k) !== v)) errors.push('The clues do not match the city.')
  const givensWanted = new Map(puzzle.givens.flatMap((v, i) => (v > 0 ? [[i, v] as const] : [])))
  if (givens.size !== givensWanted.size || [...givensWanted].some(([i, v]) => givens.get(i) !== v)) errors.push('The given plots do not match the city.')
  if (frame !== 4) errors.push('The city’s frame is not drawn.')

  const open = grid.flatMap((v, i) => (puzzle.givens[i]! > 0 ? [] : [[i, v] as const]))
  if (heights.size !== open.length || open.some(([i, v]) => heights.get(i) !== v)) errors.push('The answer’s heights are not on their plots.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== skySignText(city)) errors.push('The board does not name the skyline.')
  if (legendHeights !== n) errors.push('The legend gives the wrong heights.')
  if (legendClue !== 1) errors.push('The legend does not show a sample clue.')
  return [...new Set(errors)]
}
