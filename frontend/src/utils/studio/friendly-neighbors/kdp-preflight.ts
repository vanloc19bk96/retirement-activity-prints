import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { NEIGHBORS_STREETS, neighborsLevelSpec, neighborsSignText, type NeighborsBookEntry, type NeighborsLevel, type NeighborsStreet } from './content'
import { NEIGHBORS_PART_KEY, neighborsLegendBox, neighborsSignBox } from './draw'
import { NEIGHBORS_DIGIT_MIN, NEIGHBORS_SIGN_GAP_MIN, NEIGHBORS_SIGN_MIN, NEIGHBORS_SIGN_PAD_X, NEIGHBORS_STREET_MIN, neighborsSignSpec, neighborsTextWidth, type NeighborsPlan } from './layout'
import { neighborsBlocksBalanced, neighborsClueCount, neighborsClueRange, neighborsSignature, type NeighborsBuilt } from './puzzle'
import { NEIGHBORS_BLANK, isNeighborsSolution, neighborsAnswerKey, neighborsBlockCells, neighborsWellFormed, solveNeighbors } from './solver'

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
 * The last gate before a Friendly Neighbors page is accepted.
 *
 * A town with two answers, or one that needs a guess, is a puzzle the reader
 * cannot finish honestly — and they blame themselves. So the town is proven,
 * not trusted: its blocks must be whole pieces of one to five houses, mostly
 * fours and fives; the answer must number every block 1 up to its size with
 * no two touching houses alike and keep every printed number; a fair share
 * of numbers must be on the page; and the level's own steps, used the way a
 * reader would, must finish the town on exactly that answer (which also
 * proves it is the only one) — and the easier steps alone must not, where
 * the level asks for more. Then the page: houses at least the level's floor,
 * numbers at least 16 pt with room round them inside a house, streets wide
 * enough to see, the street's name inside its sign, everything on the
 * printable panel with air between; and not a street the book already uses
 * while others wait, nor a town the book already prints.
 */
export function runNeighborsKdpPreflight(options: {
  built: NeighborsBuilt
  plan: NeighborsPlan
  level: NeighborsLevel
  street: NeighborsStreet
  panel: Box
  font: string
  book?: readonly NeighborsBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, street, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = neighborsLevelSpec(level)
  const { puzzle, values } = built
  const n = puzzle.size

  // The town.
  if (n !== spec.size) errors.push(`The town is not ${spec.gridLabel}.`)
  if (!neighborsWellFormed(puzzle)) errors.push('The town has a block that is not one piece of one to five houses, or a printed number its block cannot hold.')
  else {
    if (!neighborsBlocksBalanced(n, puzzle.blocks)) errors.push('The town has too many small blocks.')
    if (!isNeighborsSolution(puzzle, values)) errors.push('The answer does not number every block 1 up to its size with no touching houses alike.')
    else {
      const [fewest, most] = neighborsClueRange(spec)
      const count = neighborsClueCount(puzzle)
      if (count < fewest || count > most) errors.push('The page prints too few or too many numbers for this level.')
      const solve = solveNeighbors(puzzle, spec.rules)
      if (!solve.solved || neighborsAnswerKey(solve.values) !== neighborsAnswerKey(values)) errors.push('The town cannot be finished by logic alone to its one answer.')
      else if (spec.beyond && solveNeighbors(puzzle, spec.beyond).solved) errors.push('The town is too easy for this level.')
    }
    if (neighborsSignature(puzzle) !== built.signature) errors.push('The town’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The houses print smaller than this level allows.')
  if (plan.digitSize < NEIGHBORS_DIGIT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.digitSize * 1.2 > plan.cell - plan.street) errors.push('The numbers crowd their houses.')
  if (plan.street < NEIGHBORS_STREET_MIN || plan.inner * 2 > plan.street) errors.push('The streets between blocks are too narrow to see.')
  if (plan.signSize < NEIGHBORS_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The town is not the level’s size.')
  const sign = neighborsSignBox(plan, street, font)
  if (neighborsTextWidth(neighborsSignText(street, plan.signLines), plan.signSize, neighborsSignSpec(font)) > sign.width - NEIGHBORS_SIGN_PAD_X + 0.5) errors.push(`“${street.name}” does not fit on its sign.`)
  const legend = neighborsLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The town'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + NEIGHBORS_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the town.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the town.')

  // The book.
  const used = new Set(book.map((e) => e.street))
  if (used.has(street.id) && NEIGHBORS_STREETS.some((w) => !used.has(w.id))) errors.push(`The book already uses ${street.name} while other streets wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this town.')

  return { ok: errors.length === 0, errors }
}

function walkTree(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walkTree(child, visit)
}

/**
 * The drawn page, checked against the town it was drawn from: every block
 * outlined, and the lines between houses drawn; every printed number bold in
 * its house, and no other; every other number waiting, hidden, in its own
 * house; the streets waiting, hidden, to be paved; the sign naming the
 * street; and the legend showing the block of three and the touching pair.
 */
export function checkNeighborsDrawnPage(options: { puzzle: StudioFabricObject; built: NeighborsBuilt; street: NeighborsStreet }): string[] {
  const { puzzle: group, built, street } = options
  const { puzzle, values } = built
  const n = puzzle.size
  const errors: string[] = []
  const givens = new Map<number, number>()
  const answers = new Map<number, number>()
  const blocks: StudioFabricObject[] = []
  const houses: StudioFabricObject[] = []
  let streets = 0
  let sign: StudioFabricObject | null = null
  const legendWords: string[] = []
  let legendNumbers = 0
  let legendCross = 0
  walkTree(group, (o) => {
    const role = String(o.data?.[NEIGHBORS_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'given') {
      if (givens.has(at)) errors.push('A number is drawn twice.')
      givens.set(at, Number(o.text))
      if (o.visible === false) errors.push('A printed number is hidden on the puzzle page.')
      if (Number(o.fontWeight) !== 700) errors.push('A printed number is not bold.')
    } else if (role === 'answer') {
      if (answers.has(at)) errors.push('An answer is drawn twice.')
      answers.set(at, Number(o.text))
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('An answer shows on the puzzle page.')
    } else if (role === 'blocks') {
      blocks.push(o)
      if (o.visible === false) errors.push('The blocks are hidden on the puzzle page.')
    } else if (role === 'houses') {
      houses.push(o)
      if (o.visible === false) errors.push('The lines between houses are hidden on the puzzle page.')
    } else if (role === 'streets') {
      streets++
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The paved streets show on the puzzle page.')
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text') legendWords.push(String(o.data?.entry))
    else if (role === 'legend-number') legendNumbers++
    else if (role === 'legend-cross') legendCross++
  })

  const expected = new Map(puzzle.clues.flatMap((v, s) => (v === NEIGHBORS_BLANK ? [] : [[s, v] as const])))
  if (givens.size !== expected.size || [...expected].some(([s, v]) => givens.get(s) !== v)) errors.push('The printed numbers do not match the town.')
  const blanks = puzzle.clues.flatMap((v, s) => (v === NEIGHBORS_BLANK ? [s] : []))
  if (answers.size !== blanks.length || blanks.some((s) => answers.get(s) !== values[s])) errors.push('The written-in numbers do not match the answer.')

  const cells = neighborsBlockCells(puzzle)
  const shared = cells.reduce((sum, list) => {
    const inside = new Set(list)
    return sum + list.filter((s) => s % n < n - 1 && inside.has(s + 1)).length + list.filter((s) => inside.has(s + n)).length
  }, 0)
  if (blocks.length !== 1 || blocks[0]!.data?.blocks !== puzzle.blocks.join(',') || Number(blocks[0]!.data?.count) !== cells.length) errors.push('The blocks are not drawn as the town has them.')
  if (shared > 0 && (houses.length !== 1 || Number(houses[0]!.data?.count) !== shared)) errors.push('The lines between houses are not all drawn.')
  if (streets !== 1) errors.push('The streets are not ready to pave on the answer page.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== neighborsSignText(street)) errors.push('The sign does not name the street.')
  if (legendWords.sort().join(',') !== 'block,touch' || legendNumbers !== 5 || legendCross !== 1) errors.push('The legend does not show the block of three and the touching pair.')
  return [...new Set(errors)]
}
