import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { GP_GARDENS, gpLevelSpec, gpSignText, type GpBookEntry, type GpGarden, type GpLevel } from './content'
import { GP_PART_KEY, gpBedTints, gpLegendBox, gpSignBox, gpWallRuns } from './draw'
import { GP_SIGN_GAP_MIN, GP_SIGN_MIN, GP_SIGN_PAD_X, gpSignSpec, gpTextWidth, type GpPlan } from './layout'
import { GP_MIN_BED, gpSignature, type GpBuilt } from './puzzle'
import { gpFlowerList, gpFlowersOf, gpWellFormed, isGpSolution, solveGp } from './solver'

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
 * The last gate before a Garden Plots page is accepted.
 *
 * A garden with two answers, or one that needs a guess, is a puzzle the
 * reader cannot finish honestly — and they blame themselves. So the garden
 * is proven, not trusted: every bed is one patch of at least two squares;
 * the answer must obey every rule; and the level's own steps, used the way
 * a reader would, must finish the garden on exactly that answer (which also
 * proves it is the only one) — and the basic steps alone must not, where
 * the level asks for more. Then the page: squares at least the level's
 * floor, the garden's name inside its sign, everything on the printable
 * panel with air between; and not a garden the book already uses while
 * others wait.
 */
export function runGpKdpPreflight(options: {
  built: GpBuilt
  plan: GpPlan
  level: GpLevel
  garden: GpGarden
  panel: Box
  font: string
  book?: readonly GpBookEntry[]
}): KdpPreflightResult {
  const { built, plan, level, garden, panel, font, book = [] } = options
  const errors: string[] = []
  const spec = gpLevelSpec(level)
  const { puzzle, flowers } = built

  // The garden.
  if (puzzle.size !== spec.size) errors.push(`The garden is not ${spec.gridLabel}.`)
  if (!gpWellFormed(puzzle)) errors.push('A garden bed is missing or in pieces.')
  else if (Array.from({ length: puzzle.size }, (_, k) => puzzle.beds.filter((b) => b === k).length).some((count) => count < GP_MIN_BED)) {
    errors.push('A garden bed is a single square.')
  }
  if (!isGpSolution(puzzle, flowers)) errors.push('The answer breaks a rule.')
  else {
    const solve = solveGp(puzzle, spec.rules)
    if (!solve.solved || gpFlowerList(gpFlowersOf(solve.state)) !== gpFlowerList(flowers)) errors.push('The garden cannot be finished by logic alone to its one answer.')
    else if ((spec.beyond && solveGp(puzzle, spec.beyond).solved) || solve.tally.sets + solve.tally.probe < spec.minSets) errors.push('The garden is too easy for this level.')
  }
  if (gpSignature(puzzle) !== built.signature) errors.push('The garden’s fingerprint does not match it.')

  // The page.
  if (plan.size !== spec.size) errors.push('The page was planned for another level.')
  if (plan.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print smaller than this level allows.')
  if (plan.signSize < GP_SIGN_MIN - 1e-6) errors.push('The sign prints below 14 pt.')
  const side = spec.size * plan.cell
  if (Math.abs(plan.grid.width - side) > 0.5 || Math.abs(plan.grid.height - side) > 0.5) errors.push('The garden is not the level’s size.')
  const sign = gpSignBox(plan, garden, font)
  if (gpTextWidth(gpSignText(garden, plan.signLines), plan.signSize, gpSignSpec(font)) > sign.width - GP_SIGN_PAD_X + 0.5) errors.push(`“${garden.name}” does not fit on its sign.`)
  const legend = gpLegendBox(plan, font)
  for (const [box, what] of [
    [sign, 'The sign'],
    [legend, 'The legend'],
    [plan.grid, 'The garden'],
  ] as const) {
    if (!inside(box, panel)) errors.push(`${what} runs past the printable area of this page.`)
  }
  if (sign.top + sign.height + GP_SIGN_GAP_MIN > plan.grid.top + 0.5) errors.push('The sign crowds the garden.')
  if (legend.top < plan.grid.top + plan.grid.height + 12) errors.push('The legend crowds the garden.')

  // The book.
  const used = new Set(book.map((e) => e.garden))
  if (used.has(garden.id) && GP_GARDENS.some((g) => !used.has(g.id))) errors.push(`The book already uses the ${garden.name} while other gardens wait.`)
  if (book.some((e) => e.signature === built.signature)) errors.push('The book already prints this garden.')

  return { ok: errors.length === 0, errors }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * The drawn page, checked against the garden it was drawn from: a wall on
 * every stretch where two beds meet and nowhere else, no two neighbouring
 * beds in one tint, a flower waiting, hidden, on every planted square and
 * nowhere else, the sign naming the garden, and the legend counting the
 * beds and showing the flower to plant.
 */
export function checkGpDrawnPage(options: { puzzle: StudioFabricObject; built: GpBuilt; garden: GpGarden }): string[] {
  const { puzzle: group, built, garden } = options
  const { puzzle, flowers } = built
  const n = puzzle.size
  const errors: string[] = []
  const walls: string[] = []
  let frame = 0
  const planted = new Set<number>()
  let hearts = 0
  let sign: StudioFabricObject | null = null
  let legendBeds: number | null = null
  let legendFlowers: number | null = null
  let legendFlower = 0
  const tinted = new Map<number, string>()
  walk(group, (o) => {
    const role = o.data?.[GP_PART_KEY]
    if (role === 'wall') {
      if (o.data?.line === 'frame') frame++
      else walls.push(`${o.data?.line}:${o.data?.from}-${o.data?.to}`)
      if (o.visible === false) errors.push('A wall is hidden on the puzzle page.')
    } else if (role === 'flower') {
      const at = Number(o.data?.row) * n + Number(o.data?.col)
      if (planted.has(at)) errors.push('A flower is drawn twice.')
      planted.add(at)
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A flower shows on the puzzle page.')
    } else if (role === 'flower-heart') {
      hearts++
      if (o.visible !== false || o.studioRole !== 'answer') errors.push('A flower shows on the puzzle page.')
    } else if (role === 'tint') tinted.set(Number(o.data?.bed), String(o.fill))
    else if (role === 'sign-text') sign = o
    else if (role === 'legend-text' && o.data?.beds !== undefined) legendBeds = Number(o.data.beds)
    else if (role === 'legend-text' && o.data?.flowers !== undefined) legendFlowers = Number(o.data.flowers)
    else if (role === 'legend-flower') {
      legendFlower++
      if (o.visible === false) errors.push('The legend’s flower is hidden.')
    }
  })

  const { across, down } = gpWallRuns(n, puzzle.beds)
  const expected = [...down.map(([l, f, t]) => `c${l}:${f}-${t}`), ...across.map(([l, f, t]) => `r${l}:${f}-${t}`)].sort()
  if (walls.sort().join(' ') !== expected.join(' ')) errors.push('The walls do not follow the garden beds.')
  if (frame !== 4) errors.push('The garden’s frame is not drawn.')

  // Beds that share a side never share a tint (white beds draw no tint).
  const tints = gpBedTints(n, puzzle.beds)
  for (let i = 0; i < n * n; i++) {
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j < 0) continue
      const a = puzzle.beds[i]!
      const b = puzzle.beds[j]!
      if (a !== b && tints[a] === tints[b]) errors.push('Two neighbouring beds share a tint.')
      if (a !== b && (tinted.get(a) ?? 'white') === (tinted.get(b) ?? 'white')) errors.push('Two neighbouring beds print in one tint.')
    }
  }

  if (gpFlowerList([...planted]) !== gpFlowerList(flowers)) errors.push('The answer plants a flower off its square.')
  if (hearts !== flowers.length) errors.push('A flower on the answer page has no heart.')

  const signed = sign as StudioFabricObject | null
  if (!signed || String(signed.text).replace('\n', ' ') !== gpSignText(garden)) errors.push('The sign does not name the garden.')
  if (legendBeds !== n || legendFlowers !== n) errors.push('The legend counts the beds wrong.')
  if (legendFlower !== 1) errors.push('The legend does not show the flower to plant.')
  return [...new Set(errors)]
}
