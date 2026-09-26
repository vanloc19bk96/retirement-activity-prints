import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { isValidPlDesign, plLevelPictures, plLevelSpec, type PlBookEntry, type PlDesign, type PlLevel } from './content'
import { PL_PART_KEY } from './draw'
import { PL_CLUE_CELL_LIMIT, PL_CLUE_MIN, PL_MYSTERY_SIZE, plLineNumbers, plNameWidth, plNumberWidth, plRowClueCenters, plRowClueWidth, type PlPlan } from './layout'
import { cluesOf, solvesTo, type Clues } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

const sameClues = (a: Clues, b: Clues) => JSON.stringify(a) === JSON.stringify(b)

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Picture Logic page is accepted.
 *
 * A nonogram with one wrong number is unsolvable, and the reader blames
 * themselves. So the puzzle is proven, not trusted: the clues are worked
 * out again from the picture and must match; a reader's line-by-line solve
 * of them must finish with no guessing and land on exactly this picture.
 * Then the page: squares at least the level's floor, numbers at 12 pt or
 * more and inside their squares, every clue in its lane, the whole puzzle
 * on the printable panel, the answer line long enough for the name; and
 * not a picture the book already prints while the level has fresh ones.
 */
export function runPlKdpPreflight(options: {
  design: PlDesign
  plan: PlPlan
  level: PlLevel
  panel: Box
  book?: readonly PlBookEntry[]
  /** Pictures too big for this trim: they do not count as unused. */
  unfit?: ReadonlySet<string>
}): KdpPreflightResult {
  const { design, plan, level, panel, book = [], unfit } = options
  const errors: string[] = []
  const spec = plLevelSpec(level)
  const name = design.picture.name

  if (!isValidPlDesign(design, level)) errors.push(`“${name}” is not a picture of this level.`)
  if (design.width > spec.maxSide || design.height > spec.maxSide) errors.push(`“${name}” is larger than ${spec.gridLabel}.`)
  if (!sameClues(design.clues, cluesOf(design.bitmap))) errors.push('The clues do not match the picture.')
  else if (!solvesTo(design.clues, design.bitmap)) errors.push(`“${name}” cannot be solved one line at a time.`)
  const shaded = design.bitmap.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
  const share = shaded / (design.width * design.height)
  if (share < 0.2 || share > 0.8) errors.push(`“${name}” is too bare or too dark to be a picture.`)

  // The page.
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print below this level’s size.')
  if (plan.clueSize < PL_CLUE_MIN - 1e-6) errors.push('Clue numbers print below 12 pt.')
  if (plan.clueSize > plan.cell * PL_CLUE_CELL_LIMIT + 1e-6) errors.push('Clue numbers are too big for their squares.')
  const longestCol = Math.max(...design.clues.cols.flat(), 0)
  if (plNumberWidth(longestCol, plan.clueSize) > plan.cell - 2) errors.push('A column clue is wider than its column.')
  for (const clue of design.clues.rows) {
    if (plRowClueWidth(clue, plan.clueSize, plan.slotWidth) > plan.rowClueWidth + 1e-6) errors.push('A row clue runs past its lane.')
    // Neighbours' centres at least half of each one's width plus air apart.
    const numbers = plLineNumbers(clue)
    const centers = plRowClueCenters(clue, plan.clueSize, plan.slotWidth)
    for (let i = 1; i < numbers.length; i++) {
      const room = centers[i - 1]! - centers[i]!
      const need = (plNumberWidth(numbers[i - 1]!, plan.clueSize) + plNumberWidth(numbers[i]!, plan.clueSize)) / 2 + plan.clueSize * 0.3
      if (room < need - 1e-6) errors.push('Two row clue numbers would touch.')
    }
  }
  if (Math.abs(plan.grid.width - design.width * plan.cell) > 0.5 || Math.abs(plan.grid.height - design.height * plan.cell) > 0.5) {
    errors.push('The grid is not the picture’s size.')
  }
  if (!inside(plan.block, panel)) errors.push('The puzzle does not fit the printable area of this page.')
  if (plan.grid.left - plan.gap - plan.rowClueWidth < panel.left - 0.5 || plan.grid.top - plan.gap - plan.colClueHeight < panel.top - 0.5) {
    errors.push('The clues run past the printable area.')
  }
  if (plNameWidth(name) > plan.mystery.lineRight - plan.mystery.lineLeft + 0.5) errors.push(`“${name}” does not fit on the answer line.`)
  if (plan.mystery.top < plan.grid.top + plan.grid.height + PL_MYSTERY_SIZE * 0.5) errors.push('The answer line crowds the grid.')

  // The book.
  const inBook = new Set(book.map((e) => e.id))
  const fresh = plLevelPictures(level).some((p) => !inBook.has(p.id) && !unfit?.has(p.id))
  if (inBook.has(design.picture.id) && fresh) errors.push(`The book already has “${name}” while other pictures are unused.`)

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the puzzle it was drawn from: every clue
 * number printed once, in its line, in order; the hidden picture exactly
 * the shaded squares (one bar per run, all hidden until the answer page);
 * and the name waiting on the answer line.
 */
export function checkPlDrawnPage(options: { puzzle: StudioFabricObject; design: PlDesign }): string[] {
  const { puzzle, design } = options
  const errors: string[] = []
  const printed = new Map<string, number[]>()
  const bars: StudioFabricObject[] = []
  let answerName: StudioFabricObject | null = null
  walk(puzzle, (o) => {
    const role = o.data?.[PL_PART_KEY]
    if (role === 'clue') {
      const line = String(o.data?.line)
      printed.set(line, [...(printed.get(line) ?? []), Number(o.text)])
    } else if (role === 'answer') bars.push(o)
    else if (role === 'mystery-answer') answerName = o
  })

  const expect = (line: string, clue: readonly number[]) => {
    const want = clue.length > 0 ? clue : [0]
    const got = printed.get(line) ?? []
    if (got.join(',') !== want.join(',')) errors.push(`Line ${line} prints ${got.join(' ') || 'nothing'} instead of ${want.join(' ')}.`)
  }
  design.clues.rows.forEach((clue, r) => expect(`r${r}`, clue))
  design.clues.cols.forEach((clue, c) => expect(`c${c}`, clue))
  if (printed.size !== design.width + design.height) errors.push('The page prints clues for lines the picture does not have.')

  const runs = design.clues.rows.reduce((sum, clue) => sum + clue.length, 0)
  if (bars.length !== runs) errors.push('The answer does not shade exactly the picture’s runs.')
  const shaded = design.bitmap.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
  const barred = bars.reduce((sum, b) => sum + Number(b.data?.length ?? 0), 0)
  if (barred !== shaded) errors.push('The answer shades a different number of squares than the picture.')
  for (const bar of bars) {
    const r = Number(bar.data?.row)
    const from = Number(bar.data?.from)
    const length = Number(bar.data?.length)
    for (let c = from; c < from + length; c++) if (!design.bitmap[r]?.[c]) errors.push('The answer shades a square the picture leaves blank.')
    if (bar.visible !== false) errors.push('The answer shows on the puzzle page.')
  }
  const named = answerName as StudioFabricObject | null
  if (!named || named.text !== design.picture.name || named.visible !== false) errors.push('The picture’s name is not waiting, hidden, on the answer line.')
  return [...new Set(errors)]
}
