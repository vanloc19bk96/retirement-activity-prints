import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_ANSWER_INK, STUDIO_INK } from '@/constants/studio.constants'
import { unionObjectBounds, type Box } from '../studio-layout'
import {
  buildCenteredLine,
  buildGroup,
  buildPolygon,
  buildPolyline,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { hasWall, type MazeCell } from '../maze/generator'
import { SM_TEMPLATE_KEY } from './content'
import { isInside } from './mask'
import type { ShapedMazePuzzle, ShapedOpening } from './generator'
import { openingPoint, SM_FINISH_WORD, SM_START_WORD, type SmOpeningPlacement, type SmPagePlan } from './layout'

/**
 * The shaped maze as ink on a black-and-white interior.
 *
 * Pure black lines on white paper — no fills, greys or textures. The outline
 * is drawn heavier than the walls inside it, as a few continuous lines rather
 * than hundreds of bars, so the shape reads first and the two gaps in it read
 * as the way in and the way out. Its outer corners are softened into short
 * curves, which is what turns a staircase of cells into a teapot; its inner
 * corners stay square, because rounding those would open a sliver of paper
 * between two corridors that do not connect. Inner walls are merged into runs,
 * as in the regular Maze.
 */

export const SM_WALL_INK = STUDIO_INK

/** Outer-corner softening, as a share of the corridor width. */
const CORNER_ROUND = 0.34
/** Points along each softened corner. */
const CORNER_STEPS = 4

interface Point {
  x: number
  y: number
}

interface Run {
  from: number
  to: number
}

function collectRuns(length: number, isSet: (i: number) => boolean): Run[] {
  const runs: Run[] = []
  let from = -1
  for (let i = 0; i < length; i++) {
    if (isSet(i)) {
      if (from < 0) from = i
    } else if (from >= 0) {
      runs.push({ from, to: i - 1 })
      from = -1
    }
  }
  if (from >= 0) runs.push({ from, to: length - 1 })
  return runs
}

function wallBar(left: number, top: number, width: number, height: number, tag: StudioTag): StudioFabricObject {
  return buildRect(
    {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      fill: SM_WALL_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/** Walls between two cells of the shape. The outline is drawn separately. */
function drawInnerWalls(puzzle: ShapedMazePuzzle, grid: Box, plan: SmPagePlan, tag: StudioTag): StudioFabricObject[] {
  const { rows, cols, mask } = puzzle
  const { cell, wallWidth } = plan.metrics
  const half = wallWidth / 2
  const bars: StudioFabricObject[] = []
  for (let r = 1; r < rows; r++) {
    const set = (c: number) => puzzle.hWalls[r]![c]! && isInside(mask, r - 1, c) && isInside(mask, r, c)
    for (const run of collectRuns(cols, set)) {
      bars.push(wallBar(grid.left + run.from * cell - half, grid.top + r * cell - half, (run.to - run.from + 1) * cell + wallWidth, wallWidth, tag))
    }
  }
  for (let c = 1; c < cols; c++) {
    const set = (r: number) => puzzle.vWalls[r]![c]! && isInside(mask, r, c - 1) && isInside(mask, r, c)
    for (const run of collectRuns(rows, set)) {
      bars.push(wallBar(grid.left + c * cell - half, grid.top + run.from * cell - half, wallWidth, (run.to - run.from + 1) * cell + wallWidth, tag))
    }
  }
  return bars
}

/** A lattice vertex, as `row,col` of the grid-line crossing. */
type Vertex = string
const vkey = (r: number, c: number): Vertex => `${r},${c}`
const vparse = (v: Vertex): [number, number] => v.split(',').map(Number) as [number, number]

/**
 * The outline as chains of grid vertices: every edge between a cell of the
 * shape and open paper (or a hole) that still carries a wall. The two
 * openings have no wall, so the loop they sit on breaks into an open chain
 * there. Exported for the preflight, which checks the outline is whole.
 */
export function outlineChains(puzzle: ShapedMazePuzzle): Vertex[][] {
  const { rows, cols, mask } = puzzle
  const edges: [Vertex, Vertex][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isInside(mask, r, c)) continue
      if (!isInside(mask, r - 1, c) && hasWall(puzzle, { r, c }, 0)) edges.push([vkey(r, c), vkey(r, c + 1)])
      if (!isInside(mask, r + 1, c) && hasWall(puzzle, { r, c }, 2)) edges.push([vkey(r + 1, c), vkey(r + 1, c + 1)])
      if (!isInside(mask, r, c - 1) && hasWall(puzzle, { r, c }, 3)) edges.push([vkey(r, c), vkey(r + 1, c)])
      if (!isInside(mask, r, c + 1) && hasWall(puzzle, { r, c }, 1)) edges.push([vkey(r, c + 1), vkey(r + 1, c + 1)])
    }
  }

  const byVertex = new Map<Vertex, number[]>()
  edges.forEach(([a, b], i) => {
    byVertex.set(a, [...(byVertex.get(a) ?? []), i])
    byVertex.set(b, [...(byVertex.get(b) ?? []), i])
  })
  const used = new Uint8Array(edges.length)
  const walk = (from: Vertex): Vertex[] => {
    const chain: Vertex[] = [from]
    let at = from
    for (;;) {
      const next = (byVertex.get(at) ?? []).find((i) => !used[i])
      if (next === undefined) break
      used[next] = 1
      const [a, b] = edges[next]!
      at = a === at ? b : a
      chain.push(at)
    }
    return chain
  }

  const chains: Vertex[][] = []
  // Open chains first (they end at an opening), then the closed loops.
  for (const [v, list] of byVertex) if (list.length % 2 === 1 && list.some((i) => !used[i])) chains.push(walk(v))
  for (let i = 0; i < edges.length; i++) if (!used[i]) chains.push(walk(edges[i]![0]))
  return chains
}

/** Cells of the shape round a lattice vertex — 1 means an outer corner. */
function cellsAround(puzzle: ShapedMazePuzzle, v: Vertex): number {
  const [r, c] = vparse(v)
  let n = 0
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [0, 0],
  ] as const) {
    if (isInside(puzzle.mask, r + dr, c + dc)) n++
  }
  return n
}

/** A chain as page points, with every outer corner softened into a short curve. */
function chainPoints(chain: Vertex[], puzzle: ShapedMazePuzzle, grid: Box, cell: number): Point[] {
  const closed = chain.length > 2 && chain[0] === chain[chain.length - 1]
  const verts = closed ? chain.slice(0, -1) : chain
  const at = (v: Vertex): Point => {
    const [r, c] = vparse(v)
    return { x: grid.left + c * cell, y: grid.top + r * cell }
  }
  const n = verts.length
  const radius = cell * CORNER_ROUND
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const p = at(verts[i]!)
    const hasPrev = closed || i > 0
    const hasNext = closed || i < n - 1
    if (!hasPrev || !hasNext) {
      out.push(p)
      continue
    }
    const prev = at(verts[(i - 1 + n) % n]!)
    const next = at(verts[(i + 1) % n]!)
    const turns = (prev.x - p.x) * (next.y - p.y) - (prev.y - p.y) * (next.x - p.x) !== 0
    if (!turns || cellsAround(puzzle, verts[i]!) !== 1) {
      out.push(p)
      continue
    }
    const ux = Math.sign(prev.x - p.x)
    const uy = Math.sign(prev.y - p.y)
    const wx = Math.sign(next.x - p.x)
    const wy = Math.sign(next.y - p.y)
    const a = { x: p.x + ux * radius, y: p.y + uy * radius }
    const b = { x: p.x + wx * radius, y: p.y + wy * radius }
    for (let s = 0; s <= CORNER_STEPS; s++) {
      const t = s / CORNER_STEPS
      const u = 1 - t
      out.push({ x: u * u * a.x + 2 * u * t * p.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p.y + t * t * b.y })
    }
  }
  if (closed && out.length > 0) out.push(out[0]!)
  return out.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }))
}

function drawOutline(puzzle: ShapedMazePuzzle, grid: Box, plan: SmPagePlan, tag: StudioTag): StudioFabricObject[] {
  const { cell, borderWidth } = plan.metrics
  return outlineChains(puzzle).map((chain) => {
    const points = chainPoints(chain, puzzle, grid, cell)
    return buildPolyline(
      {
        left: 0,
        top: 0,
        points,
        stroke: SM_WALL_INK,
        strokeWidth: borderWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        fill: 'transparent',
      },
      tag,
      'structure',
    )
  })
}

function cellCenter(grid: Box, cell: number, at: MazeCell): Point {
  return { x: Math.round(grid.left + at.c * cell + cell / 2), y: Math.round(grid.top + at.r * cell + cell / 2) }
}

/** Collapse collinear points so each straight leg of the route is one segment. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const n = out.length
    if (n >= 2) {
      const a = out[n - 2]!
      const b = out[n - 1]!
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[n - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

/** Where the route leaves the maze: through the gap, to the outside of the outline's ink. */
function gapPoint(opening: ShapedOpening, grid: Box, plan: SmPagePlan): Point {
  const p = openingPoint(opening, grid, plan.metrics.cell)
  const out = plan.metrics.inkPad
  const dx = opening.dir === 1 ? out : opening.dir === 3 ? -out : 0
  const dy = opening.dir === 2 ? out : opening.dir === 0 ? -out : 0
  return { x: Math.round(p.x + dx), y: Math.round(p.y + dy) }
}

/**
 * The solution: hidden on the puzzle page, revealed on the key. Drawn through
 * corridor centres from the stored route — the same cells the preflight
 * walked — so the key cannot show a path the maze does not have.
 */
function drawSolution(puzzle: ShapedMazePuzzle, grid: Box, plan: SmPagePlan, tag: StudioTag): StudioFabricObject[] {
  const { cell, routeWidth } = plan.metrics
  if (puzzle.solution.length === 0) return []
  const points = simplify([
    gapPoint(puzzle.start, grid, plan),
    ...puzzle.solution.map((at) => cellCenter(grid, cell, at)),
    gapPoint(puzzle.finish, grid, plan),
  ])
  const segments: StudioFabricObject[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    segments.push(
      buildCenteredLine(
        {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: STUDIO_ANSWER_INK,
          strokeWidth: routeWidth,
          strokeUniform: true,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
        },
        tag,
        'answer',
      ),
    )
  }
  return segments
}

/**
 * A solid triangle in the arrow's box. Start arrows point into the maze,
 * Finish arrows point out of it — a reader never has to guess which is which.
 */
function arrow(box: Box, pointing: number, tag: StudioTag): StudioFabricObject {
  const { width: w, height: h } = box
  const points =
    pointing === 0
      ? [{ x: 0, y: h }, { x: w, y: h }, { x: w / 2, y: 0 }]
      : pointing === 2
        ? [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w / 2, y: h }]
        : pointing === 3
          ? [{ x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h / 2 }]
          : [{ x: 0, y: 0 }, { x: 0, y: h }, { x: w, y: h / 2 }]
  return buildPolygon(
    { left: box.left, top: box.top, points, fill: SM_WALL_INK, stroke: 'transparent', strokeWidth: 0 },
    tag,
    'structure',
  )
}

/** The bold word over the place name, centred in the caption's box. */
function caption(box: Box, word: string, place: string, plan: SmPagePlan, lineHeight: number, font: string, tag: StudioTag): StudioFabricObject[] {
  const centerX = Math.round(box.left + box.width / 2)
  const common = {
    left: centerX,
    width: Math.ceil(box.width),
    fontSize: plan.metrics.labelFont,
    fontFamily: font,
    textAlign: 'center' as const,
    originX: 'center' as const,
  }
  return [
    buildText({ ...common, top: Math.round(box.top), text: word, fontWeight: 700 }, tag, 'structure'),
    buildText({ ...common, top: Math.round(box.top + lineHeight), text: place, fontWeight: 400 }, tag, 'structure'),
  ]
}

const shift = (box: Box, dy: number): Box => ({ ...box, top: box.top + dy })

/**
 * One shaped maze, drawn where the plan put it, moved down the page by `dy`
 * (the key sets the same maze a little higher, having no instruction line).
 *
 * Grouped, so a seller can move the whole puzzle and the route travels with
 * it. The group carries the page's book label and a digest of the maze
 * itself, so the book remembers which shape and journey it printed and a
 * duplicate page is caught whatever surrounds it.
 */
export function drawShapedMaze(options: {
  puzzle: ShapedMazePuzzle
  plan: SmPagePlan
  start: SmOpeningPlacement
  finish: SmOpeningPlacement
  startLabel: string
  finishLabel: string
  font: string
  tag: StudioTag
  dy: number
  /** `shape|version|start|finish` — what the book remembers of this page. */
  contentLabel: string
  /** Digest of the maze's structure. */
  canonical: string
}): StudioFabricObject {
  const { puzzle, plan, start, finish, startLabel, finishLabel, font, tag, dy, contentLabel, canonical } = options
  const grid = shift(plan.grid, dy)
  const parts: StudioFabricObject[] = [
    ...drawInnerWalls(puzzle, grid, plan, tag),
    ...drawOutline(puzzle, grid, plan, tag),
    ...drawSolution(puzzle, grid, plan, tag),
    arrow(shift(start.arrow, dy), (start.opening.dir + 2) % 4, tag),
    arrow(shift(finish.arrow, dy), finish.opening.dir, tag),
    ...caption(shift(start.caption, dy), SM_START_WORD, startLabel, plan, plan.start.lineHeight, font, tag),
    ...caption(shift(finish.caption, dy), SM_FINISH_WORD, finishLabel, plan, plan.finish.lineHeight, font, tag),
  ]
  const group = buildGroup(parts, unionObjectBounds(parts) ?? grid, tag, 'prompt')
  return {
    ...group,
    data: {
      source: SM_TEMPLATE_KEY,
      [STUDIO_CONTENT_LABEL_KEY]: contentLabel,
      [STUDIO_CANONICAL_KEY]: `${SM_TEMPLATE_KEY}:${canonical}`,
    },
  }
}
