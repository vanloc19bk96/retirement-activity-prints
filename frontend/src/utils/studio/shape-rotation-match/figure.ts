import type { StudioRng } from '../studio-rng'
import { clampCellCount, legibleShapesUpToSpan, MAX_CELLS } from './polyomino'
import type { Cell, Figure } from './types'

/**
 * Figures are sampled uniformly from the enumerated polyomino catalogue (see
 * polyomino.ts) rather than grown from a preset list, so every legible shape of a
 * given size is equally reachable and two users rarely land on the same page.
 */

function shiftCell(cell: Cell, minR: number, minC: number): Cell {
  return { r: cell.r - minR, c: cell.c - minC }
}

export function normalize(fig: Figure): Figure {
  let minR = Infinity
  let minC = Infinity
  for (const { r, c } of fig.cells) {
    if (r < minR) minR = r
    if (c < minC) minC = c
  }
  return {
    cells: fig.cells
      .map((cell) => shiftCell(cell, minR, minC))
      .sort((a, b) => (a.r === b.r ? a.c - b.c : a.r - b.r)),
    accent: shiftCell(fig.accent, minR, minC),
  }
}

export function key(fig: Figure): string {
  const n = normalize(fig)
  const body = n.cells.map(({ r, c }) => `${r},${c}`).join('|')
  return `${body}@${n.accent.r},${n.accent.c}`
}

function mapCells(fig: Figure, map: (cell: Cell) => Cell): Figure {
  return normalize({
    cells: fig.cells.map(map),
    accent: map(fig.accent),
  })
}

/** Quarter turn clockwise on screen (rows grow downward). */
export function rotate90(fig: Figure): Figure {
  return mapCells(fig, ({ r, c }) => ({ r: c, c: -r }))
}

export function mirrorH(fig: Figure): Figure {
  return mapCells(fig, ({ r, c }) => ({ r, c: -c }))
}

export function rotateBy(fig: Figure, quarterTurns: number): Figure {
  let out = normalize(fig)
  const n = ((quarterTurns % 4) + 4) % 4
  for (let i = 0; i < n; i++) out = rotate90(out)
  return out
}

export function isRotationOf(a: Figure, b: Figure): boolean {
  const target = key(b)
  return [0, 1, 2, 3].some((q) => key(rotateBy(a, q)) === target)
}

export function isMirrorOf(a: Figure, b: Figure): boolean {
  return isRotationOf(mirrorH(a), b)
}

/**
 * Identity across rotation *and* mirror. Used to keep one page from showing a shape
 * and its own mirror image as two separate questions, which reads like a misprint.
 */
export function identityKey(fig: Figure): string {
  const base = normalize(fig)
  const mirrored = mirrorH(base)
  const keys: string[] = []
  for (const start of [base, mirrored]) {
    for (const q of [0, 1, 2, 3]) keys.push(key(rotateBy(start, q)))
  }
  return keys.sort()[0]!
}

/**
 * A figure is only usable when its four rotations all look different and its mirror
 * is never one of them. Otherwise "same or mirrored?" has no honest answer.
 */
function isPlayable(fig: Figure): boolean {
  const rotations = [0, 1, 2, 3].map((q) => key(rotateBy(fig, q)))
  if (new Set(rotations).size !== 4) return false
  return !isRotationOf(fig, mirrorH(fig))
}

export function generateFigure(
  cellCount: number,
  rng: StudioRng,
  maxSpan = MAX_CELLS,
): Figure {
  const n = clampCellCount(cellCount)
  const shapes = legibleShapesUpToSpan(n, maxSpan)
  if (shapes.length === 0) {
    throw new Error(`shape-rotation-match: no catalogued shapes for ${n} cells`)
  }

  for (let attempt = 0; attempt < 200; attempt++) {
    const shape = rng.pick(shapes)
    const accent = rng.pick(shape)
    const fig = normalize({
      cells: shape.map((cell) => ({ ...cell })),
      accent: { ...accent },
    })
    if (isPlayable(fig)) return fig
  }

  if (maxSpan < MAX_CELLS) return generateFigure(n, rng, MAX_CELLS)
  throw new Error(`shape-rotation-match: no playable figure at ${n} cells`)
}

export function generateUniqueFigure(
  cellCount: number,
  rng: StudioRng,
  used: Set<string>,
  maxSpan = MAX_CELLS,
  maxAttempts = 80,
): Figure {
  const n = clampCellCount(cellCount)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const fig = generateFigure(n, rng, maxSpan)
    const id = identityKey(fig)
    if (!used.has(id)) {
      used.add(id)
      return fig
    }
  }
  const fig = generateFigure(n, rng, maxSpan)
  used.add(identityKey(fig))
  return fig
}
