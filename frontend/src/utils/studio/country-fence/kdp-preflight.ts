import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { FENCE_PASTURES, fenceLevelSpec, fenceSignText, type FenceBookEntry, type FenceLevel, type FencePasture } from './content'
import { FENCE_PART_KEY, fenceLegendBox, fenceSignBox } from './draw'
import { FENCE_DIGIT_MIN, FENCE_SIGN_GAP_MIN, FENCE_SIGN_MIN, FENCE_SIGN_PAD_X, fenceSignSpec, fenceTextWidth, type FencePlan } from './layout'
import { fenceClueCount, fenceSignature, type FenceBuilt } from './puzzle'
import { FENCE_BLANK, fenceAnswerKey, fenceInside, fenceLoopOrder, fenceWellFormed, isFenceSolution, solveFence } from './solver'

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
 * The last gate before a Country Fence page is accepted.
 *
 * A field with two fences, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the field
 * is proven, not trusted: the fence must be one closed loop that gives
 * every number its count, round a pasture of a fair size with a fence long
 * enough to be worth building; and the level's own steps, used the way a
 * reader would, must finish the field on exactly that fence (which also
 * proves it is the only one) — and the easier steps alone must not, where
 * the level asks for more. Then the page: squares at least the level's
 * floor, numbers at least 16 pt, the pasture's name inside its board,
 * everything on the printable panel with air between; and not a pasture the
 * book already uses while others wait, nor a field the book already prints.
 */
export function runFenceKdpPreflight(options: {
  built: FenceBuilt
  plan: FencePlan
  level: FenceLevel
  pasture: FencePasture
  panel: Box
  font: string
  book?: readonly FenceBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, pasture, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = fenceLevelSpec(level)
  const { puzzle, rails } = built
  const n = puzzle.size

  // The field.
  if (n !== spec.size) errors.push(`The field is not ${spec.gridLabel}.`)
  if (!fenceWellFormed(puzzle)) errors.push('The field has a square that is neither blank nor a number from 0 to 3.')
  else {
    if (fenceClueCount(puzzle) === 0) errors.push('The field has no numbers.')
    const order = fenceLoopOrder(n, rails)
    if (!order) errors.push('The fence is not one closed loop.')
    else {
      if (rails.length < Math.ceil(spec.length * n * n)) errors.push('The fence is too short for this field.')
      const area = fenceInside(n, rails).reduce((sum, v) => sum + v, 0)
      if (area < Math.round(spec.area[0] * n * n) || area > Math.round(spec.area[1] * n * n)) errors.push('The pasture takes too little or too much of the field.')
    }
    if (!isFenceSolution(puzzle, rails)) errors.push('The fence breaks a number’s count.')
    else {
      const solve = solveFence(puzzle, spec.rules)
      if (!solve.solved || fenceAnswerKey(solve.rails) !== fenceAnswerKey(rails)) errors.push('The field cannot be finished by logic alone to its one fence.')
      else if (spec.beyond && solveFence(puzzle, spec.beyond).solved) errors.push('The field is too easy for this level.')
    }
    if (fenceSignature(puzzle) !== built.signature) errors.push('The field’s fingerprint does not match it.')
  }

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.digitSize < FENCE_DIGIT_MIN - 1e-6) errors.push('The numbers print below 16 pt.')
  if (plan.signSize < FENCE_SIGN_MIN - 1e-6) errors.push('The name board prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The field is not the level’s size.')
  if (!inside(plan.grid, { left: plan.field.left + plan.pad, top: plan.field.top + plan.pad, width: plan.field.width - plan.pad * 2, height: plan.field.height - plan.pad * 2 }))
    errors.push('The posts reach past the field.')
  const sign = fenceSignBox(plan, pasture, font)
  if (fenceTextWidth(fenceSignText(pasture, plan.signLines), plan.signSize, fenceSignSpec(font)) > sign.width - FENCE_SIGN_PAD_X + 0.5) errors.push(`“${pasture.name}” does not fit on its board.`)
  const legend = fenceLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The name board'],
    [legend, 'The legend'],
    [plan.field, 'The field'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + FENCE_SIGN_GAP_MIN > plan.field.top + 0.5) errors.push('The name board crowds the field.')
  if (legend.top < plan.field.top + plan.field.height + 12) errors.push('The legend crowds the field.')

  // The book.
  const used = new Set(book.map((e) => e.pasture))
  if (used.has(pasture.id) && FENCE_PASTURES.some((p) => !used.has(p.id))) errors.push(`The book already uses the ${pasture.name} while other pastures wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this field.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

const hiddenAnswer = (o: StudioFabricObject) => o.visible === false && o.studioRole === 'answer'

/**
 * The drawn page, checked against the field it was drawn from: every post,
 * row by row; every number in its square, and no other; the finished fence
 * waiting, hidden, as one rail running exactly the answer's rails with a
 * post on every post it passes, the pasture washed inside it and a tuft on
 * exactly its squares free of a number; the board naming the pasture; and
 * the legend showing the sample square and the closed fence.
 */
export function checkFenceDrawnPage(options: { puzzle: StudioFabricObject; built: FenceBuilt; pasture: FencePasture }): string[] {
  const { puzzle: group, built, pasture } = options
  const { puzzle, rails } = built
  const n = puzzle.size
  const errors: string[] = []
  const numbers = new Map<number, number>()
  const tufts = new Set<number>()
  const dotRows = new Map<number, number>()
  const fences: string[] = []
  const posts: number[] = []
  let pastures = 0
  let sign: StudioFabricObject | null = null
  const legendWords: string[] = []
  let legendNumber = false
  walk(group, (o) => {
    const role = String(o.data?.[FENCE_PART_KEY] ?? '')
    const at = Number(o.data?.row) * n + Number(o.data?.col)
    if (role === 'number') {
      if (numbers.has(at)) errors.push('A number is drawn twice.')
      numbers.set(at, Number(o.text))
      if (o.visible === false) errors.push('A number is hidden on the puzzle page.')
    } else if (role === 'dots') {
      dotRows.set(Number(o.data?.row), Number(o.data?.dots))
      if (o.visible === false) errors.push('A post is hidden on the puzzle page.')
    } else if (role === 'fence' || role === 'posts' || role === 'pasture' || role === 'tuft') {
      if (!hiddenAnswer(o)) errors.push('The finished fence shows on the puzzle page.')
      if (role === 'fence') fences.push(String(o.data?.rails))
      else if (role === 'posts') posts.push(Number(o.data?.posts))
      else if (role === 'pasture') pastures++
      else {
        if (tufts.has(at)) errors.push('A tuft is drawn twice.')
        tufts.add(at)
      }
    } else if (role === 'sign-text') sign = o
    else if (role === 'legend-text') legendWords.push(String(o.data?.entry))
    else if (role === 'legend-number') legendNumber = true
  })

  const expected = new Map(puzzle.clues.flatMap((v, s) => (v === FENCE_BLANK ? [] : [[s, v] as const])))
  if (numbers.size !== expected.size || [...expected].some(([s, v]) => numbers.get(s) !== v)) errors.push('The numbers do not match the field.')
  if (dotRows.size !== n + 1 || [...dotRows.values()].some((k) => k !== n + 1)) errors.push('The posts are not all drawn.')

  if (fences.length !== 1 || fences[0] !== fenceAnswerKey(rails)) errors.push('The fence does not run the answer’s rails.')
  const order = fenceLoopOrder(n, rails) ?? []
  if (posts.length !== 1 || posts[0] !== order.length) errors.push('The fence posts do not stand on the fence.')
  if (pastures !== 1) errors.push('The pasture is not washed in.')
  const land = fenceInside(n, rails)
  const tuftsWanted = puzzle.clues.flatMap((v, s) => (land[s] && v === FENCE_BLANK ? [s] : []))
  if (tufts.size !== tuftsWanted.length || tuftsWanted.some((s) => !tufts.has(s))) errors.push('The grass is not on the pasture’s squares.')

  const labelled = sign as StudioFabricObject | null
  if (!labelled || String(labelled.text).replace('\n', ' ') !== fenceSignText(pasture)) errors.push('The board does not name the pasture.')
  if (legendWords.sort().join(',') !== 'loop,sample' || !legendNumber) errors.push('The legend does not show the sample square and the closed fence.')
  return [...new Set(errors)]
}
