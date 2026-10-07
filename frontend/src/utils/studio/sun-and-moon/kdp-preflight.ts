import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { SM_DAYS, smLevelSpec, smSignText, type SmBookEntry, type SmDay, type SmLevel } from './content'
import { SM_GIVEN_TINT, SM_PART_KEY, smLegendBox, smSignBox, smSignsOf } from './draw'
import { SM_BADGE_MIN, SM_SIGN_GAP_MIN, SM_SIGN_MIN, SM_SIGN_PAD_X, smSignSpec, smTextWidth, type SmPlan } from './layout'
import { smClueCount, smHardSteps, smSignature, type SmBuilt } from './puzzle'
import { SM_BLANK, SM_MOON, SM_SUN, isSmSolution, smAnswerText, smWellFormed, solveSm } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** Air kept between a sun or a moon and the white disc of a sign on its line, px. */
export const SM_SYMBOL_AIR = 2

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Sun & Moon page is accepted.
 *
 * A grid with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the grid is
 * proven, not trusted: the answer must keep every rule, every printed sun
 * and moon and every sign; the level's own steps, used the way a reader
 * would, must finish the grid on exactly that answer (which also proves it
 * is the only one) — and the easier steps alone must not, where the level
 * asks for more; and the clues are the level's share, both kinds. Then the
 * page: squares at least the level's floor, every sun and moon clear of the
 * signs on its lines, the day's name inside its sign, everything on the
 * printable panel with air between; and not a day or a grid the book
 * already uses.
 */
export function runSmKdpPreflight(options: {
  built: SmBuilt
  plan: SmPlan
  level: SmLevel
  day: SmDay
  panel: Box
  font: string
  book?: readonly SmBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, day, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = smLevelSpec(level)
  const { puzzle, answer } = built
  const squares = spec.size * spec.size

  // The grid.
  if (puzzle.size !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  if (!smWellFormed(puzzle)) errors.push('The grid is not well formed.')
  else if (!isSmSolution(puzzle, answer)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveSm(puzzle, spec.rules)
    if (!solve.solved || smAnswerText(solve.state) !== smAnswerText(answer)) errors.push('The grid cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveSm(puzzle, spec.beyond).solved) || smHardSteps(solve.tally, spec.rules) < spec.minHard) errors.push('The grid is too easy for this level.')
  }
  const { givens, signs } = smClueCount(puzzle)
  if (givens === 0 || signs === 0) errors.push('The grid needs both printed squares and signs.')
  if (givens + signs < Math.ceil(spec.clues[0] * squares) || givens + signs > Math.floor(spec.clues[1] * squares)) errors.push('The grid does not print the level’s share of clues.')
  if (smSignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.signSize < SM_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  if (plan.badge < SM_BADGE_MIN) errors.push('The = and × signs print too small.')
  if ((plan.cell - plan.symbol) / 2 - plan.badge < SM_SYMBOL_AIR) errors.push('A sun or a moon crowds the signs on its lines.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  const sign = smSignBox(plan, day, font)
  if (smTextWidth(smSignText(day, plan.signLines), plan.signSize, smSignSpec(font)) > sign.width - SM_SIGN_PAD_X + 0.5) errors.push(`“${day.name}” does not fit on its sign.`)
  const legend = smLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The grid'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + SM_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.day))
  if (used.has(day.id) && SM_DAYS.some((d) => !used.has(d.id))) errors.push(`The book already uses ${day.name} while other days wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: pale gray
 * behind every printed square and no other, every printed sun and moon in
 * its own square and showing, every other square's answer waiting hidden,
 * every sign on its own line and no other, the lines and the frame whole,
 * the sign naming the day, and the legend showing = between two suns and ×
 * between a sun and a moon.
 */
export function checkSmDrawnPage(options: { puzzle: StudioFabricObject; built: SmBuilt; day: SmDay }): string[] {
  const { puzzle: group, built, day } = options
  const { puzzle, answer } = built
  const n = puzzle.size
  const errors: string[] = []
  const tinted = new Set<number>()
  const shown = new Map<number, number>()
  const hidden = new Map<number, number>()
  const marks: string[] = []
  let discs = 0
  let rules = 0
  let frame = 0
  let sign: StudioFabricObject | null = null
  const legend = new Map<string, string[]>()
  walk(group, (o) => {
    const role = String(o.data?.[SM_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'given-tint') {
      tinted.add(at)
      if (o.fill !== SM_GIVEN_TINT) errors.push('A printed square is not tinted.')
    } else if (role === 'given-sun' || role === 'given-moon' || role === 'answer-sun' || role === 'answer-moon') {
      const value = role.endsWith('sun') ? SM_SUN : SM_MOON
      const given = role.startsWith('given')
      const into = given ? shown : hidden
      if (into.has(at)) errors.push('A square holds two suns or moons.')
      into.set(at, value)
      if (given && (o.visible === false || o.studioRole !== 'prompt')) errors.push('A printed sun or moon is hidden.')
      if (!given && (o.visible !== false || o.studioRole !== 'answer')) errors.push('An answer shows on the puzzle page.')
    } else if (role === 'sign-mark') {
      marks.push(`${o.data?.row},${o.data?.col},${o.data?.dir},${o.data?.sign}`)
      if (o.visible === false) errors.push('A sign is hidden on the puzzle page.')
    } else if (role === 'sign-mark-disc') discs++
    else if (role === 'rule') rules++
    else if (role === 'frame') frame++
    else if (role === 'sign-text') sign = o
    else if (role.startsWith('legend-') && o.data?.entry) {
      const entry = String(o.data.entry)
      legend.set(entry, [...(legend.get(entry) ?? []), role === 'legend-sign' ? `sign:${o.data?.sign}` : role === 'legend-text' ? `text:${o.text}` : role])
    }
  })

  for (let i = 0; i < n * n; i++) {
    const given = puzzle.givens[i] !== SM_BLANK
    if (given !== tinted.has(i)) errors.push('The gray squares do not match the printed ones.')
    const drawn = given ? shown.get(i) : hidden.get(i)
    if (drawn !== answer[i]) errors.push(given ? 'A printed square shows the wrong sun or moon.' : 'An answer is missing or wrong on the answer page.')
    if ((given ? hidden : shown).has(i)) errors.push('A square is drawn both printed and hidden.')
  }
  const expected = smSignsOf(built)
    .map(([row, col, dir, value]) => `${row},${col},${dir},${value === 1 ? 'same' : 'opposite'}`)
    .sort()
  if (marks.sort().join(' ') !== expected.join(' ')) errors.push('The signs do not match the grid.')
  if (discs !== expected.length) errors.push('A sign has no disc over its line.')
  if (rules !== 2 * (n + 1)) errors.push('The lines between squares are not all drawn.')
  if (frame !== 4) errors.push('The grid’s frame is not drawn.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== smSignText(day)) errors.push('The sign does not name the day.')
  const alike = legend.get('alike') ?? []
  const opposite = legend.get('opposite') ?? []
  if (!alike.includes('sign:same') || alike.filter((p) => p === 'legend-sun').length !== 2) errors.push('The legend does not show = between two suns.')
  if (!opposite.includes('sign:opposite') || !opposite.includes('legend-sun') || !opposite.includes('legend-moon')) errors.push('The legend does not show × between a sun and a moon.')
  return [...new Set(errors)]
}
