import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { PEARL_NECKLACES, pearlLevelSpec, pearlSignText, type PearlBookEntry, type PearlLevel, type PearlNecklace } from './content'
import { PEARL_PART_KEY, pearlLegendBox, pearlSignBox } from './draw'
import { PEARL_SIGN_GAP_MIN, PEARL_SIGN_MIN, PEARL_SIGN_PAD_X, pearlSignSpec, pearlTextWidth, type PearlPlan } from './layout'
import { pearlSignature, type PearlBuilt } from './puzzle'
import { PEARL_BLACK, PEARL_WHITE, isPearl, isPearlSolution, pearlAnswerKey, pearlLoopOrder, pearlWellFormed, solvePearl } from './solver'

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
 * The last gate before a String of Pearls page is accepted.
 *
 * A board with two necklaces, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the board
 * is proven, not trusted: the necklace must be one closed loop that keeps
 * every pearl's rule and wanders over enough of the board; and the level's
 * own steps, used the way a reader would, must finish the board on exactly
 * that necklace (which also proves it is the only one) — and the easier
 * steps alone must not, where the level asks for more. Then the page:
 * squares at least the level's floor, the necklace's name inside its
 * board, everything on the printable panel with air between; and not a
 * necklace the book already uses while others wait, nor a board the book
 * already prints.
 */
export function runPearlKdpPreflight(options: {
  built: PearlBuilt
  plan: PearlPlan
  level: PearlLevel
  necklace: PearlNecklace
  panel: Box
  font: string
  book?: readonly PearlBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, necklace, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = pearlLevelSpec(level)
  const { puzzle, links } = built
  const n = puzzle.size

  // The board.
  if (n !== spec.size) errors.push(`The board is not ${spec.gridLabel}.`)
  if (!pearlWellFormed(puzzle)) errors.push('The board has a square that is neither empty nor a pearl.')
  else {
    const counts = { white: 0, black: 0 }
    for (const v of puzzle.cells) {
      if (v === PEARL_WHITE) counts.white++
      else if (v === PEARL_BLACK) counts.black++
    }
    if (counts.white + counts.black < spec.minPearls) errors.push('The board has too few pearls for this level.')
    if (counts.white === 0 || counts.black === 0) errors.push('The board does not use both kinds of pearl.')
    const order = pearlLoopOrder(n, links)
    if (!order) errors.push('The necklace is not one closed loop.')
    else if (order.length < Math.ceil(spec.cover * n * n)) errors.push('The necklace covers too little of the board.')
    if (!isPearlSolution(puzzle, links)) errors.push('The necklace breaks a rule.')
    else {
      const solve = solvePearl(puzzle, spec.rules)
      if (!solve.solved || pearlAnswerKey(solve.links) !== pearlAnswerKey(links)) errors.push('The board cannot be finished by logic alone to its one necklace.')
      else if (spec.beyond && solvePearl(puzzle, spec.beyond).solved) errors.push('The board is too easy for this level.')
    }
    if (pearlSignature(puzzle) !== built.signature) errors.push('The board’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.signSize < PEARL_SIGN_MIN - 1e-6) errors.push('The name board prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The board is not the level’s size.')
  const sign = pearlSignBox(plan, necklace, font)
  if (pearlTextWidth(pearlSignText(necklace, plan.signLines), plan.signSize, pearlSignSpec(font)) > sign.width - PEARL_SIGN_PAD_X + 0.5) errors.push(`“${necklace.name}” does not fit on its board.`)
  const legend = pearlLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The name board'],
    [legend, 'The legend'],
    [plan.grid, 'The board'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + PEARL_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The name board crowds the grid.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the grid.')

  // The book.
  const used = new Set(book.map((e) => e.necklace))
  if (used.has(necklace.id) && PEARL_NECKLACES.some((h) => !used.has(h.id))) errors.push(`The book already uses the ${necklace.name} while other necklaces wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this board.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

const hiddenAnswer = (o: StudioFabricObject) => o.visible === false && o.studioRole === 'answer'

/**
 * The drawn page, checked against the board it was drawn from: every pearl
 * in its square and colour, and no other, each with its shine; the frame;
 * the finished necklace waiting, hidden, as one cord threading exactly the
 * answer's links with a bead on every square it visits between the pearls;
 * the board naming the necklace; and the legend showing both pearls.
 */
export function checkPearlDrawnPage(options: { puzzle: StudioFabricObject; built: PearlBuilt; necklace: PearlNecklace }): string[] {
  const { puzzle: group, built, necklace } = options
  const { puzzle, links } = built
  const n = puzzle.size
  const errors: string[] = []
  const pearls = new Map<number, string>()
  const shines = new Set<number>()
  const beads = new Set<number>()
  const cords: string[] = []
  let frame = 0
  let sign: StudioFabricObject | null = null
  const legendPearls: string[] = []
  const legendWords: string[] = []
  walk(group, (o) => {
    const role = String(o.data?.[PEARL_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'pearl') {
      if (pearls.has(at)) errors.push('A pearl is drawn twice.')
      pearls.set(at, String(o.data?.color))
      if (o.visible === false) errors.push('A pearl is hidden on the puzzle page.')
    } else if (role === 'pearl-shine') shines.add(at)
    else if (role === 'frame') frame++
    else if (role === 'cord' || role === 'bead') {
      if (!hiddenAnswer(o)) errors.push('The finished necklace shows on the puzzle page.')
      if (role === 'cord') cords.push(String(o.data?.links))
      else {
        if (beads.has(at)) errors.push('A bead is drawn twice.')
        beads.add(at)
      }
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-pearl') legendPearls.push(String(o.data?.color))
    else if (role === 'legend-text') legendWords.push(String(o.data?.color))
  })

  const expected = new Map(puzzle.cells.flatMap((v, i) => (isPearl(v) ? [[i, v === PEARL_WHITE ? 'white' : 'black'] as const] : [])))
  if (pearls.size !== expected.size || [...expected].some(([at, color]) => pearls.get(at) !== color)) errors.push('The pearls do not match the board.')
  if (shines.size !== expected.size || [...expected.keys()].some((at) => !shines.has(at))) errors.push('A pearl is drawn without its shine.')
  if (frame !== 4) errors.push('The board’s frame is not drawn.')

  if (cords.length !== 1 || cords[0] !== pearlAnswerKey(links)) errors.push('The cord does not thread the necklace.')
  const visited = pearlLoopOrder(n, links) ?? []
  const beadsWanted = visited.filter((i) => !isPearl(puzzle.cells[i]!))
  if (beads.size !== beadsWanted.length || beadsWanted.some((i) => !beads.has(i))) errors.push('The beads are not strung on the necklace’s squares.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== pearlSignText(necklace)) errors.push('The board does not name the necklace.')
  if (legendPearls.sort().join(',') !== 'black,white' || legendWords.sort().join(',') !== 'black,white') errors.push('The legend does not show both pearls.')
  return [...new Set(errors)]
}
