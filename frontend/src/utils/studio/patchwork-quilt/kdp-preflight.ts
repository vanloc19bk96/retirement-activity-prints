import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { PQ_QUILTS, pqLevelSpec, pqSignText, type PqBookEntry, type PqLevel, type PqQuilt } from './content'
import { PQ_PART_KEY, pqLegendBox, pqPatchFabrics, pqSeamRuns, pqSignBox } from './draw'
import { PQ_NUMBER_MIN, PQ_SIGN_GAP_MIN, PQ_SIGN_MIN, PQ_SIGN_PAD_X, pqSignSpec, pqTextWidth, type PqPlan } from './layout'
import { PQ_MIN_PATCH, pqPatchMap, pqSignature, type PqBuilt } from './puzzle'
import { isPqSolution, pqAnswerKey, pqRectKey, pqWellFormed, solvePq, type PqRect } from './solver'

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
 * The last gate before a Patchwork Quilt page is accepted.
 *
 * A quilt with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the quilt
 * is proven, not trusted: every number is at least two and no larger than
 * the level's biggest patch; the answer must obey every rule; and the
 * level's own steps, used the way a reader would, must finish the quilt on
 * exactly that answer (which also proves it is the only one) — and the
 * easier steps alone must not, where the level asks for more. Then the
 * page: squares at least the level's floor, numbers at least 16 pt, the
 * quilt's name inside its label, everything on the printable panel with air
 * between; and not a name the book already uses while others wait, nor
 * numbers the book already prints.
 */
export function runPqKdpPreflight(options: {
  built: PqBuilt
  plan: PqPlan
  level: PqLevel
  quilt: PqQuilt
  panel: Box
  font: string
  book?: readonly PqBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, quilt, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = pqLevelSpec(level)
  const { puzzle, patches } = built

  // The quilt.
  if (puzzle.size !== spec.size) errors.push(`The quilt is not ${spec.gridLabel}.`)
  if (!pqWellFormed(puzzle)) errors.push('The numbers do not add up to the quilt.')
  if (puzzle.clues.some((c) => c.size < PQ_MIN_PATCH)) errors.push('A patch is a single square.')
  if (puzzle.clues.some((c) => c.size > spec.maxPatch)) errors.push('A patch is larger than this level allows.')
  if (!isPqSolution(puzzle, patches)) errors.push('The answer breaks a rule.')
  else {
    const solve = solvePq(puzzle, spec.rules)
    if (!solve.solved || pqAnswerKey(solve.rects as PqRect[]) !== pqAnswerKey(patches)) errors.push('The quilt cannot be finished by logic alone to its one answer.')
    else if (spec.beyond && solvePq(puzzle, spec.beyond).solved) errors.push('The quilt is too easy for this level.')
  }
  if (pqSignature(puzzle) !== built.signature) errors.push('The quilt’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.numberSize < PQ_NUMBER_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < PQ_SIGN_MIN - 1e-6) errors.push('The label prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The quilt is not the level’s size.')
  const sign = pqSignBox(plan, quilt, font)
  if (pqTextWidth(pqSignText(quilt, plan.signLines), plan.signSize, pqSignSpec(font)) > sign.width - PQ_SIGN_PAD_X + 0.5) errors.push(`“${quilt.name}” does not fit on its label.`)
  const legend = pqLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The label'],
    [legend, 'The legend'],
    [plan.grid, 'The quilt'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + PQ_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The label crowds the quilt.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the quilt.')

  // The book.
  const used = new Set(book.map((e) => e.quilt))
  if (used.has(quilt.id) && PQ_QUILTS.some((q) => !used.has(q.id))) errors.push(`The book already uses the ${quilt.name} while other quilts wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this quilt.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

const hiddenAnswer = (o: StudioFabricObject) => o.visible === false && o.studioRole === 'answer'

/**
 * The drawn page, checked against the quilt it was drawn from: every number
 * on its square and no other, the binding, the sewn quilt waiting, hidden,
 * with a fabric on exactly every patch of the answer (no two neighbours
 * alike), a stitch round each, a seam on every stretch where two patches
 * meet and nowhere else, a button under every number, the label naming the
 * quilt, and the legend counting the patches.
 */
export function checkPqDrawnPage(options: { puzzle: StudioFabricObject; built: PqBuilt; quilt: PqQuilt }): string[] {
  const { puzzle: group, built, quilt } = options
  const { puzzle, patches } = built
  const n = puzzle.size
  const errors: string[] = []
  const numbers = new Map<number, number>()
  const fabrics = new Map<string, string>()
  const seams: string[] = []
  let frame = 0
  let stitches = 0
  let buttons = 0
  let sign: StudioFabricObject | null = null
  let legendPatches: number | null = null
  let legendSample = 0
  walk(group, (o) => {
    const role = o.data?.[PQ_PART_KEY]
    if (role === 'number') {
      const at = Number(o.data?.row) * n + Number(o.data?.col)
      if (numbers.has(at)) errors.push('A number is drawn twice.')
      numbers.set(at, Number(o.text))
      if (o.visible === false) errors.push('A number is hidden on the puzzle page.')
    } else if (role === 'frame') frame++
    else if (role === 'fabric') {
      fabrics.set(pqRectKey({ row: Number(o.data?.row), col: Number(o.data?.col), height: Number(o.data?.height), width: Number(o.data?.width) }), String(o.data?.fabric))
      if (!hiddenAnswer(o)) errors.push('A patch shows on the puzzle page.')
    } else if (role === 'print' || role === 'stitch' || role === 'seam' || role === 'button') {
      if (!hiddenAnswer(o)) errors.push('The sewn quilt shows on the puzzle page.')
      if (role === 'stitch') stitches++
      if (role === 'button') buttons++
      if (role === 'seam') seams.push(`${o.data?.line}:${o.data?.from}-${o.data?.to}`)
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.patches !== undefined) legendPatches = Number(o.data.patches)
    else if (role === 'legend-number') legendSample++
  })

  const expected = new Map(puzzle.clues.map((c) => [c.at, c.size]))
  if (numbers.size !== expected.size || [...expected].some(([at, size]) => numbers.get(at) !== size)) errors.push('The numbers do not match the quilt.')
  if (frame !== 4) errors.push('The quilt’s binding is not drawn.')

  if (fabrics.size !== patches.length || patches.some((rect) => !fabrics.has(pqRectKey(rect)))) errors.push('The answer’s patches are not where the answer lays them.')
  const chosen = pqPatchFabrics(n, patches)
  const map = pqPatchMap(n, patches)
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j < 0 || map[i] === map[j]) continue
      const a = patches[map[i]!]!
      const b = patches[map[j]!]!
      if (chosen[map[i]!] === chosen[map[j]!] || fabrics.get(pqRectKey(a)) === fabrics.get(pqRectKey(b))) errors.push('Two neighbouring patches share a fabric.')
    }
  }
  if (stitches !== patches.length) errors.push('A patch is not quilted.')
  const { across, down } = pqSeamRuns(n, map)
  const seamsWanted = [...down.map(([l, f, t]) => `c${l}:${f}-${t}`), ...across.map(([l, f, t]) => `r${l}:${f}-${t}`)].sort()
  if (seams.sort().join(' ') !== seamsWanted.join(' ')) errors.push('The seams do not follow the patches.')
  if (buttons !== puzzle.clues.length) errors.push('A number on the answer page has no button.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== pqSignText(quilt)) errors.push('The label does not name the quilt.')
  if (legendPatches !== patches.length) errors.push('The legend counts the patches wrong.')
  if (legendSample !== 1) errors.push('The legend does not show a sample patch.')
  return [...new Set(errors)]
}
