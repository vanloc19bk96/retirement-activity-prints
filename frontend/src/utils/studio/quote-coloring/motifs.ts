import type { StudioRng } from '../studio-rng'
import {
  chainSegments,
  cutSegments,
  inRegion,
  polylineSegments,
  pt,
  ringSegments,
  toRegion,
  type Pt,
  type Ring,
  type Seg,
} from '../stained-glass/geometry'
import { band as bandPx, blob, circle, ellipse, poly, rect, rotate, sketch, type SubjectDrawing } from '../stained-glass/subject-kit'

/**
 * The small drawings a Quote Coloring pattern is built from.
 *
 * Every motif is drawn to fit a circle of radius 1 about the origin (y down),
 * as a stack of closed shapes, bottom first: a later shape covers what it
 * overlaps, and only what shows is printed. Open lines (petal divisions, the
 * ribs of a shell) start and end on a shape, so they divide space instead of
 * dangling into it. No text, logos or characters; every motif is plain
 * geometry drawn for this game.
 *
 * `minR` is the smallest radius, in canvas px, at which every piece of the
 * motif clears the Classic coloring floor with the pattern pen — proven for
 * every motif in the tests. The pattern never places a motif smaller; the
 * other levels scale it by their floor.
 */

export type QcMotifSet = 'floral' | 'geometric' | 'travel'

export interface QcMotif {
  id: string
  set: QcMotifSet
  /** Keep it the right way up (a teacup, a sailboat); others turn freely. */
  upright: boolean
  /** Smallest radius, canvas px, at the Classic floor. */
  minR: number
  build: (rng: StudioRng) => SubjectDrawing
}

const TAU = Math.PI * 2

/** A closed curve r(θ) about the origin, θ clockwise from 3 o'clock. */
function polar(r: (theta: number) => number, steps = 120, turn = 0): Ring {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * TAU + turn
    const rr = r(a)
    return pt(Math.cos(a) * rr, Math.sin(a) * rr)
  })
}

const at = (r: number, theta: number): Pt => pt(Math.cos(theta) * r, Math.sin(theta) * r)

/** `band` from the subject kit works at its ~100-unit drawing scale; motifs are drawn at 1. */
function band(line: readonly Pt[], width: number, round = false): Ring {
  const up = line.map((p) => pt(p.x * 100, p.y * 100))
  return bandPx(up, width * 100, round).map((p) => pt(p.x / 100, p.y / 100))
}

/** Regular polygon (or star when `inner` is set) about the origin, first point straight up. */
function star(points: number, outer: number, inner?: number): Ring {
  const n = inner == null ? points : points * 2
  return Array.from({ length: n }, (_, i) => {
    const r = inner == null || i % 2 === 0 ? outer : inner
    return at(r, -Math.PI / 2 + (i / n) * TAU)
  })
}

/** A superellipse |x/a|^p + |y/b|^p = 1: a softened rectangle. */
function squircle(a: number, b: number, p = 4, steps = 96): Ring {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    return pt(a * Math.sign(c) * Math.abs(c) ** (2 / p), b * Math.sign(s) * Math.abs(s) ** (2 / p))
  })
}

/** The parts of a polyline that run inside `ring` — for veins and ribs that must end on an edge. */
function inside(line: readonly Pt[], ring: Ring): Pt[][] {
  const region = toRegion(ring)
  return chainSegments(cutSegments(polylineSegments(line), [region], (mid) => inRegion(mid, region)))
}

/* ------------------------------------------------------------------ *
 * Floral
 * ------------------------------------------------------------------ */

function daisy(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([6, 7, 8, 9])
  const depth = rng.pick([0.36, 0.42])
  const outline = polar((a) => 1 - depth + depth * Math.abs(Math.cos((n * a) / 2)) ** 0.7, n * 16, 0)
  const core = 0.3
  return sketch((s) => {
    s.add(outline)
    for (let k = 0; k < n; k++) {
      const a = ((2 * k + 1) * Math.PI) / n
      s.stroke([at(core * 0.6, a), at((1 - depth) * 0.998, a)])
    }
    s.add(circle(0, 0, core))
  })
}

function rosette(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([8, 10, 12])
  return sketch((s) => {
    s.add(polar((a) => 0.87 + 0.13 * Math.cos(n * a)))
    s.add(polar((a) => 0.56 + 0.06 * Math.cos((n / 2) * a + Math.PI)))
    s.add(circle(0, 0, 0.25))
  })
}

function tulip(rng: StudioRng): SubjectDrawing {
  const lean = rng.pick([-1, 1])
  return sketch((s) => {
    s.add(ellipse(0.34 * lean, 0.56, 0.38, 0.19, -38 * lean))
    s.add(rect(-0.09, 0, 0.18, 0.96, 0.06))
    s.add(poly([-0.54, -0.8], [-0.24, -0.46], [0, -0.9], [0.24, -0.46], [0.54, -0.8], [0.56, -0.2], [0.36, 0.08], [0, 0.18], [-0.36, 0.08], [-0.56, -0.2]))
  })
}

function leaf(rng: StudioRng): SubjectDrawing {
  const w = rng.pick([0.46, 0.52])
  const outline = blob([0, -0.98], [w, -0.3], [w * 0.72, 0.45], [0, 0.98], [-w * 0.72, 0.45], [-w, -0.3])
  const veins = rng.pick([1, 2])
  return sketch((s) => {
    s.add(outline)
    for (const line of inside([pt(0, -1.2), pt(0, 1.2)], outline)) s.stroke(line)
    for (let i = 0; i < veins; i++) {
      const y = veins === 1 ? 0 : -0.2 + i * 0.45
      for (const side of [-1, 1]) for (const line of inside([pt(0, y), pt(side * 1.2, y - 0.55)], outline)) s.stroke(line)
    }
  })
}

function sprig(rng: StudioRng): SubjectDrawing {
  const bend = rng.pick([-1, 1]) * 0.14
  const stem = [pt(-0.06, 0.96), pt(bend, 0.2), pt(0, -0.5), pt(bend * 0.5, -0.94)]
  return sketch((s) => {
    const leaves: [number, number, number][] = [
      [0.36, 0.48, -40],
      [-0.34, 0.12, 40],
      [0.34, -0.26, -45],
      [-0.3, -0.6, 45],
    ]
    for (const [x, y, deg] of leaves) s.add(ellipse(x + bend * 0.5, y, 0.36, 0.18, deg))
    s.add(band(stem, 0.16, true))
  })
}

function blossom(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([5, 6])
  const turn = -Math.PI / 2
  return sketch((s) => {
    s.add(polar((a) => 0.45 + 0.55 * Math.abs(Math.cos((n * (a - turn)) / 2)) ** 0.5, n * 20))
    s.add(circle(0, 0, 0.26))
  })
}

function swirl(): SubjectDrawing {
  const turns = 1.6
  const spiral: Pt[] = []
  for (let i = 0; i <= 80; i++) {
    const t = i / 80
    const r = 0.18 + t * 0.8
    spiral.push(at(Math.min(r, 0.998), -Math.PI / 2 + t * turns * TAU))
  }
  return sketch((s) => {
    s.add(circle(0, 0, 1, 64))
    s.stroke(spiral)
    s.add(circle(0, 0, 0.2))
  })
}

/* ------------------------------------------------------------------ *
 * Geometric
 * ------------------------------------------------------------------ */

const rings = () => sketch((s) => {
  s.add(circle(0, 0, 1, 64))
  s.add(circle(0, 0, 0.62, 56))
  s.add(circle(0, 0, 0.26))
})

const diamond = () => sketch((s) => {
  s.add(star(4, 1))
  s.add(star(4, 0.56))
  s.add(circle(0, 0, 0.2))
})

const hexflower = () => sketch((s) => {
  const outer = star(6, 1)
  const inner = star(6, 0.45)
  s.add(outer)
  inner.forEach((p, i) => s.stroke([p, outer[i]!]))
  s.add(inner)
})

function starburst(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([6, 8])
  return sketch((s) => {
    s.add(star(n, 1, 0.6))
    s.add(circle(0, 0, 0.36))
  })
}

const quatrefoil = () => sketch((s) => {
  s.add(polar((a) => 0.58 + 0.42 * Math.abs(Math.cos(2 * a)) ** 0.6, 96, Math.PI / 4))
  s.add(star(4, 0.42))
})

function scallop(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([10, 12])
  return sketch((s) => {
    s.add(polar((a) => 0.9 + 0.1 * Math.cos(n * a), n * 10))
    s.add(circle(0, 0, 0.58, 56))
    s.add(star(n / 2, 0.36))
  })
}

function sunburst(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([12, 14])
  return sketch((s) => {
    s.add(star(n, 1, 0.78))
    s.add(circle(0, 0, 0.6, 56))
    s.add(circle(0, 0, 0.28))
  })
}

const tile = () => sketch((s) => {
  s.add(squircle(0.9, 0.9, 5))
  s.add(star(4, 0.62))
  s.add(circle(0, 0, 0.22))
})

function heart(scale: number): Ring {
  return Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * TAU
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    return pt((x / 17) * scale, (y / 17) * scale + 0.08 * scale)
  })
}

const hearts = () => sketch((s) => {
  s.add(heart(1))
  s.add(heart(0.52))
})

const petalCross = () => sketch((s) => {
  for (const deg of [0, 90, 180, 270]) s.add(rotate(ellipse(0.56, 0, 0.44, 0.27), deg, 0, 0))
  s.add(circle(0, 0, 0.24))
})

/* ------------------------------------------------------------------ *
 * Travel and hobbies
 * ------------------------------------------------------------------ */

const teacup = () => sketch((s) => {
  s.add(ellipse(-0.06, 0.64, 0.9, 0.22))
  s.add(circle(0.5, -0.1, 0.44))
  s.add(circle(0.56, -0.1, 0.2))
  s.add(poly([-0.84, -0.6], [0.44, -0.6], [0.34, 0.16], [0.16, 0.48], [-0.54, 0.48], [-0.72, 0.16]))
})

const mug = () => sketch((s) => {
  s.add(rect(0.1, -0.52, 0.9, 0.98, 0.34))
  s.add(rect(0.2, -0.28, 0.54, 0.5, 0.14))
  s.add(rect(-0.86, -0.76, 1.2, 1.52, 0.12))
  s.add(rect(-0.66, -0.34, 0.8, 0.5, 0.22))
})

function sailboat(rng: StudioRng): SubjectDrawing {
  const flip = rng.pick([-1, 1])
  return sketch((s) => {
    s.add(poly([0.04 * flip, -0.92], [0.04 * flip, 0.36], [0.8 * flip, 0.36]))
    s.add(poly([-0.08 * flip, -0.7], [-0.08 * flip, 0.36], [-0.62 * flip, 0.36]))
    s.add(poly([-0.92, 0.48], [0.92, 0.48], [0.62, 0.9], [-0.62, 0.9]))
  })
}

const balloon = () => sketch((s) => {
  const envelope = blob([0, -0.98], [0.64, -0.72], [0.74, -0.2], [0.42, 0.28], [0, 0.42], [-0.42, 0.28], [-0.74, -0.2], [-0.64, -0.72])
  s.add(rect(-0.26, 0.64, 0.52, 0.32, 0.06))
  s.stroke([pt(-0.32, 0.2), pt(-0.22, 0.66)])
  s.stroke([pt(0.32, 0.2), pt(0.22, 0.66)])
  s.add(envelope)
  for (const x of [-0.3, 0.3]) for (const line of inside([pt(x * 0.2, -1.2), pt(x, -0.3), pt(x * 0.2, 0.9)], envelope)) s.stroke(line)
})

const suitcase = () => sketch((s) => {
  s.add(rect(-0.45, -0.96, 0.9, 0.62, 0.2))
  s.add(rect(-0.2, -0.7, 0.4, 0.4, 0.06))
  const body = rect(-0.86, -0.42, 1.72, 1.08, 0.18)
  s.add(body)
  for (const x of [-0.42, 0.42]) for (const line of inside([pt(x, -1), pt(x, 1)], body)) s.stroke(line)
})

function sun(rng: StudioRng): SubjectDrawing {
  const n = rng.pick([10, 12])
  return sketch((s) => {
    s.add(star(n, 1, 0.66))
    s.add(circle(0, 0, 0.5, 56))
  })
}

function fish(rng: StudioRng): SubjectDrawing {
  const flip = rng.pick([-1, 1])
  const X = (x: number) => x * flip
  return sketch((s) => {
    s.add(poly([X(0.36), 0], [X(0.98), -0.5], [X(0.84), 0], [X(0.98), 0.5]))
    s.add(poly([X(-0.3), -0.3], [X(0.04), -0.82], [X(0.42), -0.24]))
    s.add(ellipse(X(-0.16), 0, 0.68, 0.44))
    s.add(circle(X(-0.44), -0.06, 0.23))
  })
}

function bird(rng: StudioRng): SubjectDrawing {
  const flip = rng.pick([-1, 1])
  const X = (x: number) => x * flip
  return sketch((s) => {
    s.add(poly([X(0.4), -0.04], [X(0.98), -0.4], [X(0.92), 0.36]))
    s.add(poly([X(-0.56), -0.58], [X(-1), -0.2], [X(-0.5), 0.1]))
    s.add(blob([X(-0.66), -0.3], [X(-0.4), -0.64], [X(0.1), -0.3], [X(0.56), 0.02], [X(0.1), 0.46], [X(-0.5), 0.32]))
    s.add(blob([X(-0.24), 0.06], [X(0.12), -0.12], [X(0.38), 0.08], [X(0.06), 0.26]))
  })
}

const butterfly = () => sketch((s) => {
  for (const side of [-1, 1]) {
    s.add(ellipse(0.46 * side, 0.46, 0.34, 0.3, -20 * side))
    s.add(ellipse(0.5 * side, -0.34, 0.46, 0.4, 15 * side))
    s.add(circle(0.54 * side, -0.36, 0.2))
  }
  s.add(rect(-0.14, -0.62, 0.28, 1.34, 0.14))
})

const book = () => sketch((s) => {
  const left = poly([-0.96, -0.52], [-0.06, -0.64], [-0.06, 0.66], [-0.96, 0.78])
  const right = poly([0.06, -0.64], [0.96, -0.52], [0.96, 0.78], [0.06, 0.66])
  s.add(left)
  s.add(right)
  for (const y of [-0.2, 0.24]) {
    for (const line of inside([pt(-1.2, y + 0.06), pt(0, y - 0.04)], left)) s.stroke(line)
    for (const line of inside([pt(0, y - 0.04), pt(1.2, y + 0.06)], right)) s.stroke(line)
  }
})

const cottage = () => sketch((s) => {
  s.add(rect(-0.66, -0.12, 1.32, 1.04))
  s.add(poly([0, -0.96], [0.92, -0.06], [-0.92, -0.06]))
  s.add(rect(-0.52, 0.22, 0.4, 0.7, [0.18, 0]))
  s.add(rect(0.06, 0.14, 0.5, 0.46, 0.04))
})



function shell(): SubjectDrawing {
  const fan = polar((a) => {
    const d = Math.abs(a - Math.PI * 1.5)
    return d < Math.PI * 0.62 ? 0.95 - 0.05 * Math.abs(Math.cos(7 * (a - Math.PI * 1.5))) : 0.2
  }, 160).map((p) => pt(p.x, p.y + 0.5))
  return sketch((s) => {
    s.add(fan)
    for (const k of [-1.5, -0.5, 0.5, 1.5]) {
      const a = Math.PI * 1.5 + (k * Math.PI * 0.62) / 2.6
      for (const line of inside([pt(0, 0.5), pt(Math.cos(a) * 1.5, 0.5 + Math.sin(a) * 1.5)], fan)) s.stroke(line)
    }
    s.add(poly([-0.44, 0.1], [0.44, 0.1], [0.24, 0.86], [-0.24, 0.86]))
  })
}

const camera = () => sketch((s) => {
  s.add(rect(-0.46, -0.7, 0.6, 0.34, 0.08))
  s.add(rect(-0.95, -0.44, 1.9, 1.14, 0.16))
  s.add(circle(0.04, 0.14, 0.5, 48))
  s.add(circle(0.04, 0.14, 0.24))
})

const palette = () => sketch((s) => {
  s.add(blob([-0.2, -0.92], [0.6, -0.74], [0.98, -0.1], [0.72, 0.64], [0.02, 0.86], [-0.7, 0.56], [-0.96, -0.2]))
  s.add(ellipse(-0.3, 0.38, 0.22, 0.18))
  for (const [x, y] of [[-0.46, -0.24], [0.02, -0.5], [0.52, -0.2]] as const) s.add(circle(x, y, 0.23))
})

const cloud = () => sketch((s) => {
  s.add(blob([-0.96, 0.2], [-0.7, -0.18], [-0.34, -0.3], [-0.1, -0.7], [0.4, -0.62], [0.62, -0.22], [0.96, 0.02], [0.84, 0.44], [0, 0.5], [-0.8, 0.5]))
})

/* ------------------------------------------------------------------ *
 * The library
 * ------------------------------------------------------------------ */

export const QC_MOTIFS: readonly QcMotif[] = [
  { id: 'daisy', set: 'floral', upright: false, minR: 42, build: daisy },
  { id: 'rosette', set: 'floral', upright: false, minR: 46, build: rosette },
  { id: 'tulip', set: 'floral', upright: true, minR: 76, build: tulip },
  { id: 'leaf', set: 'floral', upright: false, minR: 46, build: leaf },
  { id: 'sprig', set: 'floral', upright: false, minR: 86, build: sprig },
  { id: 'blossom', set: 'floral', upright: false, minR: 44, build: blossom },
  { id: 'swirl', set: 'floral', upright: false, minR: 56, build: swirl },
  { id: 'rings', set: 'geometric', upright: false, minR: 44, build: rings },
  { id: 'diamond', set: 'geometric', upright: true, minR: 56, build: diamond },
  { id: 'hexflower', set: 'geometric', upright: true, minR: 36, build: hexflower },
  { id: 'starburst', set: 'geometric', upright: true, minR: 36, build: starburst },
  { id: 'quatrefoil', set: 'geometric', upright: true, minR: 36, build: quatrefoil },
  { id: 'scallop', set: 'geometric', upright: true, minR: 50, build: scallop },
  { id: 'sunburst', set: 'geometric', upright: true, minR: 50, build: sunburst },
  { id: 'tile', set: 'geometric', upright: true, minR: 58, build: tile },
  { id: 'hearts', set: 'geometric', upright: true, minR: 34, build: hearts },
  { id: 'petal-cross', set: 'geometric', upright: true, minR: 48, build: petalCross },
  { id: 'teacup', set: 'travel', upright: true, minR: 66, build: teacup },
  { id: 'mug', set: 'travel', upright: true, minR: 56, build: mug },
  { id: 'sailboat', set: 'travel', upright: true, minR: 44, build: sailboat },
  { id: 'balloon', set: 'travel', upright: true, minR: 60, build: balloon },
  { id: 'suitcase', set: 'travel', upright: true, minR: 62, build: suitcase },
  { id: 'sun', set: 'travel', upright: false, minR: 48, build: sun },
  { id: 'fish', set: 'travel', upright: true, minR: 68, build: fish },
  { id: 'bird', set: 'travel', upright: true, minR: 74, build: bird },
  { id: 'butterfly', set: 'travel', upright: true, minR: 60, build: butterfly },
  { id: 'book', set: 'travel', upright: true, minR: 44, build: book },
  { id: 'cottage', set: 'travel', upright: true, minR: 50, build: cottage },
  { id: 'shell', set: 'travel', upright: true, minR: 66, build: shell },
  { id: 'camera', set: 'travel', upright: true, minR: 58, build: camera },
  { id: 'palette', set: 'travel', upright: false, minR: 58, build: palette },
  { id: 'cloud', set: 'travel', upright: true, minR: 18, build: cloud },
]

export const qcMotif = (id: string): QcMotif | undefined => QC_MOTIFS.find((m) => m.id === id)

export const motifsOf = (set: QcMotifSet): QcMotif[] => QC_MOTIFS.filter((m) => m.set === set)

/**
 * Small, plain shapes for the gaps the main motifs leave: one or two pieces
 * each, so they stay colorable at sizes a detailed motif could not.
 */
export const QC_FILLERS: Readonly<Record<QcMotifSet, readonly QcMotif[]>> = {
  floral: [
    { id: 'dot-flower', set: 'floral', upright: false, minR: 34, build: () => sketch((s) => { s.add(polar((a) => 0.72 + 0.28 * Math.cos(5 * a))); s.add(circle(0, 0, 0.34)) }) },
    { id: 'small-leaf', set: 'floral', upright: false, minR: 20, build: () => sketch((s) => { s.add(blob([0, -0.98], [0.5, -0.1], [0, 0.98], [-0.5, -0.1])) }) },
  ],
  geometric: [
    { id: 'dot', set: 'geometric', upright: false, minR: 16, build: () => sketch((s) => { s.add(circle(0, 0, 1, 40)) }) },
    { id: 'small-diamond', set: 'geometric', upright: true, minR: 36, build: () => sketch((s) => { s.add(star(4, 1)); s.add(star(4, 0.4)) }) },
  ],
  travel: [
    { id: 'small-star', set: 'travel', upright: true, minR: 20, build: () => sketch((s) => { s.add(star(5, 1, 0.5)) }) },
    { id: 'small-cloud', set: 'travel', upright: true, minR: 22, build: cloud },
  ],
}

/**
 * What a drawing prints: every shape's outline where no later shape covers
 * it, and every open line where no later shape covers it.
 */
export function drawingOutline(drawing: SubjectDrawing): Pt[][] {
  const regions = drawing.pieces.map((p) => toRegion(p.ring))
  const segs: Seg[] = []
  drawing.pieces.forEach((piece, index) => {
    const above = regions.slice(index + 1)
    segs.push(...cutSegments(ringSegments(piece.ring), above, (mid) => !above.some((r) => inRegion(mid, r))))
  })
  for (const stroke of drawing.strokes) {
    const above = regions.slice(stroke.under)
    segs.push(...cutSegments(polylineSegments(stroke.pts), above, (mid) => !above.some((r) => inRegion(mid, r))))
  }
  return chainSegments(segs)
}

/**
 * A motif drawn at `r` px about (cx, cy), turned `deg` degrees. The drawing
 * is moved onto the page before its outline is traced, so the tracing works
 * in canvas px like every other line on the page.
 */
export function placeMotif(drawing: SubjectDrawing, cx: number, cy: number, r: number, deg: number): Pt[][] {
  const k = r / Math.max(1, drawingRadius(drawing))
  const map = (points: readonly Pt[]) => {
    const moved = points.map((p) => pt(cx + p.x * k, cy + p.y * k))
    return deg === 0 ? moved : rotate(moved, deg, cx, cy)
  }
  return drawingOutline({
    pieces: drawing.pieces.map((piece) => ({ ...piece, ring: map(piece.ring) })),
    strokes: drawing.strokes.map((stroke) => ({ ...stroke, pts: map(stroke.pts) })),
  })
}

/** Every point a placed motif prints lies within `r` of its centre (the unit-circle contract). */
export function drawingRadius(drawing: SubjectDrawing): number {
  let max = 0
  for (const piece of drawing.pieces) for (const p of piece.ring) max = Math.max(max, Math.hypot(p.x, p.y))
  for (const stroke of drawing.strokes) for (const p of stroke.pts) max = Math.max(max, Math.hypot(p.x, p.y))
  return max
}
