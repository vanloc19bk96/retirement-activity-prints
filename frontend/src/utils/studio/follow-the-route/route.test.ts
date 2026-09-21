import { describe, it, expect } from 'vitest'
import {
  cellCode,
  columnLetter,
  dirsFor,
  generateRoute,
  isInsideGrid,
  maxAdvance,
  moveCell,
  reverseDir,
  routeStepsKey,
  sameCell,
  simulateRoute,
  type RouteSpec,
} from './route'
import { ROUTE_TIERS, ROUTE_TIER_KEYS, type Route, type RouteTierKey } from './types'

/** §10 #1 — the invariant sweep is the ship gate for this engine. */
const SEEDS_PER_TIER = 10_000

const specFor = (tier: RouteTierKey, diagonals = false): RouteSpec => {
  const preset = ROUTE_TIERS[tier]
  return {
    rows: preset.gridRows,
    cols: preset.gridCols,
    numSteps: preset.numSteps,
    maxStepLen: preset.maxStepLen,
    diagonals: diagonals && preset.allowsDiagonals,
  }
}

/**
 * Every property §3 promises, checked on one route. Returns what broke rather
 * than asserting: the sweep runs tens of thousands of routes, and one `expect`
 * per property turns a two-second gate into a minute of matcher bookkeeping.
 */
function routeViolation(route: Route, spec: RouteSpec): string | null {
  const legalDirs = dirsFor(spec.diagonals)
  if (route.steps.length !== spec.numSteps) return 'step count'
  if (route.gridRows !== spec.rows || route.gridCols !== spec.cols) return 'grid size'

  for (const step of route.steps) {
    if (step.count < 1) return 'step below 1'
    if (step.count > spec.maxStepLen) return 'step past maxStepLen'
    if (!legalDirs.includes(step.dir)) return `illegal direction ${step.dir}`
  }
  // No step cancels or continues the one before it (merge same-dir into one count).
  for (let i = 1; i < route.steps.length; i++) {
    const prev = route.steps[i - 1]!.dir
    const dir = route.steps[i]!.dir
    if (dir === reverseDir(prev)) return 'cancelling step'
    if (dir === prev) return 'repeated direction'
  }

  for (const cell of route.path) {
    if (!isInsideGrid(cell, spec.rows, spec.cols)) return 'path left the grid'
  }
  const length = 1 + route.steps.reduce((sum, step) => sum + step.count, 0)
  if (route.path.length !== length) return 'path length'
  if (!sameCell(route.path[0]!, route.start)) return 'path does not start at start'
  if (!sameCell(route.path[route.path.length - 1]!, route.end)) return 'path does not end at end'
  // The recorded answer must survive an independent re-simulation.
  if (!sameCell(simulateRoute(route.start, route.steps), route.end)) return 'answer'
  if (sameCell(route.end, route.start)) return 'end equals start'
  return null
}

function sweep(spec: RouteSpec): string[] {
  const failures: string[] = []
  for (let i = 0; i < SEEDS_PER_TIER; i++) {
    const seed = i + 1
    const violation = routeViolation(generateRoute(seed, spec), spec)
    if (violation) failures.push(`seed ${seed}: ${violation}`)
  }
  return failures.slice(0, 10)
}

describe('follow-the-route engine', () => {
  it.each(ROUTE_TIER_KEYS)(
    '%s holds every route invariant across 10 000 seeds',
    (tier) => {
      expect(sweep(specFor(tier))).toEqual([])
    },
    30_000,
  )

  it('holds the invariants with diagonal moves switched on', () => {
    const spec = specFor('expert', true)
    expect(spec.diagonals).toBe(true)
    expect(sweep(spec)).toEqual([])
  }, 30_000)

  it('is deterministic for a seed and spec', () => {
    const spec = specFor('medium')
    for (const seed of [1, 42, 7919, 4_294_967_295]) {
      expect(generateRoute(seed, spec)).toEqual(generateRoute(seed, spec))
    }
  })

  it('varies with the seed', () => {
    const spec = specFor('easy')
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const route = generateRoute(1_000 + i * 7_919, spec)
      seen.add(`${route.start.row},${route.start.col}|${routeStepsKey(route)}`)
    }
    // Warm-up is the smallest tier; even Easy must not collapse onto a handful.
    expect(seen.size).toBeGreaterThan(150)
  })

  it('measures how far a direction can advance', () => {
    expect(maxAdvance({ row: 1, col: 1 }, 'U', 5, 5)).toBe(0)
    expect(maxAdvance({ row: 1, col: 1 }, 'D', 5, 5)).toBe(4)
    expect(maxAdvance({ row: 3, col: 2 }, 'R', 5, 5)).toBe(3)
    expect(maxAdvance({ row: 3, col: 2 }, 'L', 5, 5)).toBe(1)
    // A diagonal stops at whichever edge comes first.
    expect(maxAdvance({ row: 3, col: 2 }, 'DR', 5, 5)).toBe(2)
    expect(maxAdvance({ row: 2, col: 4 }, 'UR', 5, 5)).toBe(1)
  })

  it('moves with row down and col right', () => {
    expect(moveCell({ row: 3, col: 3 }, 'U', 2)).toEqual({ row: 1, col: 3 })
    expect(moveCell({ row: 3, col: 3 }, 'D')).toEqual({ row: 4, col: 3 })
    expect(moveCell({ row: 3, col: 3 }, 'L')).toEqual({ row: 3, col: 2 })
    expect(moveCell({ row: 3, col: 3 }, 'UR', 2)).toEqual({ row: 1, col: 5 })
  })

  it('reverses every direction, diagonals included', () => {
    for (const dir of dirsFor(true)) {
      expect(reverseDir(reverseDir(dir))).toBe(dir)
      expect(moveCell(moveCell({ row: 4, col: 4 }, dir), reverseDir(dir))).toEqual({
        row: 4,
        col: 4,
      })
    }
  })

  it('reads coordinates column-then-row', () => {
    expect(cellCode({ row: 4, col: 3 })).toBe('C4')
    expect(cellCode({ row: 1, col: 1 })).toBe('A1')
    expect(columnLetter(8)).toBe('H')
  })
})
