import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { PA_CAPTION_PROMPT, PA_LEGEND_LINES, PA_LEGEND_NUMBER, isValidPaDesign, paLevelPictures, paLevelSpec, type PaBookEntry, type PaDesign, type PaLevel } from './content'
import { PA_PART_KEY, paRuns } from './draw'
import {
  PA_CORNER_CLEAR,
  PA_DIGIT_MIN,
  PA_LEGEND_GAP,
  PA_LEGEND_SIZE_MIN,
  PA_NAME_SIZE,
  PA_PROMPT_SIZE,
  paCornerClearance,
  paDigitAir,
  paDigitAirNeeded,
  paTextSpec,
  paTextWidth,
  type PaPlan,
} from './layout'
import { paHardSteps, paSignature, type PaBuilt } from './puzzle'
import { isPaSolution, paBitmapText, paCellsText, paWellFormed, solvePa } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** Shaded share a snapshot must keep: enough to be a picture, not so much it is a black square. */
export const PA_SHADE_MIN = 0.2
export const PA_SHADE_MAX = 0.75

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

/**
 * The last gate before a Photo Album page is accepted.
 *
 * A grid with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the grid is
 * proven, not trusted: it must be the level's picture, the right way round;
 * every printed number must count its block of that picture; the level's
 * own steps, used the way a reader would, must finish the grid on exactly
 * that picture (which also proves it is the only answer) — and the easier
 * steps alone must not, where the level asks for more. Then the page:
 * squares at least the level's floor, numbers at least 12 pt with air
 * round them, the caption and every name fitting the snapshot's border,
 * the album corners clear of the grid, everything on the printable panel;
 * and not a picture the book already shows while others wait, nor a grid it
 * already prints.
 */
export function runPaKdpPreflight(options: {
  built: PaBuilt
  design: PaDesign
  plan: PaPlan
  level: PaLevel
  panel: Box
  font: string
  book?: readonly PaBookEntry[]
}): KdpPreflightResult {
  const { built, design, plan, level, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = paLevelSpec(level)
  const { puzzle, bitmap } = built

  // The picture.
  if (!isValidPaDesign(design, level)) errors.push('The picture is not one of this level’s snapshots.')
  if (paBitmapText(bitmap) !== paBitmapText(design.bitmap)) errors.push('The grid hides another picture.')
  const shaded = bitmap.filter(Boolean).length / Math.max(1, bitmap.length)
  if (shaded < PA_SHADE_MIN || shaded > PA_SHADE_MAX) errors.push('The picture is too faint or too dark to read.')

  // The grid.
  if (puzzle.width !== spec.size || puzzle.height !== spec.size) errors.push(`The grid is not ${spec.gridLabel}.`)
  if (!paWellFormed(puzzle)) errors.push('The grid is not well formed.')
  else if (!isPaSolution(puzzle, bitmap)) errors.push('A number does not count its block.')
  else {
    const solve = solvePa(puzzle, spec.rules)
    if (!solve.solved || paCellsText(solve.cells) !== paBitmapText(bitmap)) errors.push('The grid cannot be finished by logic alone to its one picture.')
    else if ((spec.beyond && solvePa(puzzle, spec.beyond).solved) || paHardSteps(solve.tally, spec.rules) < spec.minHard) errors.push('The grid is too easy for this level.')
  }
  if (paSignature(puzzle) !== built.signature) errors.push('The grid’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.digitSize < PA_DIGIT_MIN - 1e-6) errors.push('The numbers print below 12 pt.')
  if (paDigitAir(plan.cell, plan.digitSize) < paDigitAirNeeded(plan.cell) - 1e-6) errors.push('The numbers crowd their squares.')
  if (plan.legend && plan.legend.size < PA_LEGEND_SIZE_MIN - 1e-6) errors.push('The legend prints below 12 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The grid is not the level’s size.')
  if (!inside(plan.grid, plan.frame)) errors.push('The grid runs out of the snapshot.')
  if (paCornerClearance(plan.border, plan.cornerLeg) < PA_CORNER_CLEAR - 1e-6) errors.push('An album corner covers the grid.')
  const line = plan.caption.lineRight - plan.caption.lineLeft
  if (plan.caption.lineLeft < plan.grid.left - 0.5 || plan.caption.lineRight > plan.grid.left + plan.grid.width + 0.5) errors.push('The caption line runs out of the snapshot.')
  if (paTextWidth(PA_CAPTION_PROMPT, PA_PROMPT_SIZE, paTextSpec(font)) > plan.grid.width + 0.5) errors.push('The caption does not fit the snapshot.')
  if (paLevelPictures(level).some((p) => paTextWidth(p.name, PA_NAME_SIZE, paTextSpec(font, 700)) > line + 0.5)) errors.push('A snapshot’s name does not fit the caption line.')
  if (plan.caption.lineTop > plan.frame.top + plan.frame.height - plan.border + 1) errors.push('The caption line crowds the snapshot’s edge.')
  if (plan.caption.promptTop < plan.grid.top + plan.grid.height + 6) errors.push('The caption crowds the grid.')
  const corners: Box = { left: plan.frame.left - 4, top: plan.frame.top - 4, width: plan.frame.width + 8, height: plan.frame.height + 8 }
  if (!inside(corners, panel)) errors.push('The snapshot runs past the printable area of this page.')
  if (plan.legend) {
    if (!inside(plan.legend.box, panel)) errors.push('The legend runs past the printable area of this page.')
    if (plan.legend.box.top < corners.top + corners.height + PA_LEGEND_GAP - 0.5) errors.push('The legend crowds the snapshot.')
  }

  // The book.
  const used = new Set(book.map((e) => e.id))
  if (used.has(design.picture.id) && paLevelPictures(level).some((p) => !used.has(p.id))) errors.push(`The book already shows the ${design.picture.name.toLowerCase()} while other snapshots wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this grid.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the grid it was drawn from: every printed
 * number in its square and no other, the picture waiting hidden as exactly
 * its runs, the snapshot's border, edge, lines and four corners drawn, the
 * caption asking its question with the name waiting hidden on its line, and
 * (where the page has room for it) the legend working its block of nine.
 */
export function checkPaDrawnPage(options: { puzzle: StudioFabricObject; built: PaBuilt; design: PaDesign; plan: Pick<PaPlan, 'legend'> }): string[] {
  const { puzzle: group, built, design, plan } = options
  const { puzzle, bitmap } = built
  const n = puzzle.width
  const errors: string[] = []
  const clues = new Map<number, number>()
  const runs: string[] = []
  const counts = new Map<string, number>()
  let prompt: StudioFabricObject | null = null
  let name: StudioFabricObject | null = null
  let legendText: StudioFabricObject | null = null
  let legendNumber: StudioFabricObject | null = null
  walk(group, (o) => {
    const role = String(o.data?.[PA_PART_KEY] ?? '')
    counts.set(role, (counts.get(role) ?? 0) + 1)
    if (role === 'clue') {
      const at = Number(o.data?.row) * n + Number(o.data?.col)
      if (clues.has(at)) errors.push('A square holds two numbers.')
      clues.set(at, Number(o.text))
      if (o.visible === false || o.studioRole !== 'prompt') errors.push('A number is hidden.')
    } else if (role === 'answer') {
      runs.push(`${o.data?.row}:${o.data?.from}:${o.data?.length}`)
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('The picture shows on the puzzle page.')
    } else if (role === 'caption-prompt') prompt = o
    else if (role === 'caption-answer') name = o
    else if (role === 'legend-text') legendText = o
    else if (role === 'legend-number') legendNumber = o
  })

  puzzle.clues.forEach((v, i) => {
    if (v >= 0 && clues.get(i) !== v) errors.push('A number is missing or wrong.')
  })
  if (clues.size !== puzzle.clues.filter((v) => v >= 0).length) errors.push('A number is drawn where none is printed.')
  const expected = paRuns(bitmap, n).map((r) => `${r.row}:${r.from}:${r.length}`)
  if (runs.length !== expected.length || expected.some((r) => !runs.includes(r))) errors.push('The hidden picture is not the grid’s answer.')
  if ((counts.get('rule') ?? 0) !== 2 * (n + 1)) errors.push('The lines between squares are not all drawn.')
  if ((counts.get('edge') ?? 0) !== 4) errors.push('The grid’s edge is not drawn.')
  if ((counts.get('frame') ?? 0) !== 1) errors.push('The snapshot’s border is not drawn.')
  if ((counts.get('corner') ?? 0) !== 4) errors.push('The album corners are not all drawn.')
  if ((counts.get('caption-line') ?? 0) !== 1) errors.push('The caption line is not drawn.')

  const asked = prompt as StudioFabricObject | null
  if (!asked || asked.text !== PA_CAPTION_PROMPT) errors.push('The caption does not ask its question.')
  const named = name as StudioFabricObject | null
  if (!named || named.text !== design.picture.name || named.visible !== false || named.studioRole !== 'answer') errors.push('The snapshot’s name does not wait hidden on the caption line.')
  const legend = legendText as StudioFabricObject | null
  const worked = legendNumber as StudioFabricObject | null
  if (plan.legend) {
    if (!legend || legend.text !== PA_LEGEND_LINES.join('\n') || !worked || worked.text !== String(PA_LEGEND_NUMBER) || (counts.get('legend-shade') ?? 0) !== PA_LEGEND_NUMBER) {
      errors.push('The legend does not work its block of nine.')
    }
  } else if (legend || worked) errors.push('The legend is drawn on a page planned without one.')
  return [...new Set(errors)]
}
