import type { StudioFabricObject } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { distToSegment, ringBounds, type Pt } from '../stained-glass/geometry'
import { dtdDesignEntry, dtdSubjectById, isValidDtdDesign, type DtdBookEntry, type DtdDesign, type DtdLevelSpec } from './content'
import { DTD_INK_WIDTH, DTD_PART_KEY, DTD_START_RING } from './draw'
import { LABEL_AIR, closestDotToLine, closestPair, deviationFrom, isSimpleLoop, labelRoom, type DtdPuzzle } from './puzzle'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** No number prints below 10 pt (13.33 canvas px). */
export const DTD_NUMBER_FLOOR_PX = 13
/** The picture's longer side prints at least this large. */
export const DTD_MIN_PICTURE_INCHES = 2.8
/** And fills at least this share of the room it was given along its tighter side. */
export const DTD_MIN_FILL = 0.9

const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The last gate before a page is accepted.
 *
 * A dot-to-dot with one numbering mistake is unusable, so the numbering is
 * proven, not trusted: exactly 1 to N, each number once, each on exactly
 * one dot, in path order. Then the page as a reader meets it: dots a clear
 * gap apart and clear of every line but their own, an outline that never
 * crosses itself and stays true to the picture, every number readable, on
 * the page, clear of every line, dot and other number and nearer its own dot
 * than any other; pre-drawn details clear of the outline; a real subject,
 * big enough to be the picture; and not a shape the book already prints
 * while the theme still has fresh ones. Any failure sends the page back to
 * be rebuilt, never into the book.
 */
export function runDtdKdpPreflight(options: {
  design: DtdDesign
  puzzle: DtdPuzzle
  level: DtdLevelSpec
  panel: Box
  book?: readonly DtdBookEntry[]
}): KdpPreflightResult {
  const { design, puzzle, level, panel, book = [] } = options
  const rules = level.rules
  const errors: string[] = []
  const name = design.subject.name

  if (!dtdSubjectById(design.subject.id)) errors.push('The page shows a subject that is not in the library.')
  else if (!isValidDtdDesign(design)) errors.push(`“${name}” is not a version its drawing has.`)

  // The numbering: 1 to N, each once, each on one dot, in path order.
  const dots = puzzle.dots
  const n = dots.length
  if (n < rules.dots.min || n > rules.dots.max) errors.push(`The picture has ${n} dots; this level prints ${rules.dots.min} to ${rules.dots.max}.`)
  if (dots.some((d, i) => d.n !== i + 1)) errors.push('The dots are not numbered 1 to N in order.')
  if (new Set(dots.map((d) => d.n)).size !== n) errors.push('A number appears twice.')
  if (dots.some((d) => !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.label.x) || !Number.isFinite(d.label.y))) {
    errors.push('A dot or number has no position.')
  }
  const pts = dots.map((d) => ({ x: d.x, y: d.y }))

  // The dots and the outline they make.
  if (n >= 3) {
    if (closestPair(pts) < rules.minGap - 1e-6) errors.push('Two dots sit too close together.')
    if (closestDotToLine(pts) < rules.minGap * 0.6 - 1e-6) errors.push('A dot sits on a line it is not part of.')
    if (!isSimpleLoop(pts)) errors.push('The finished outline crosses itself.')
    const shape = ringBounds(puzzle.contour)
    const size = Math.max(shape.maxX - shape.minX, shape.maxY - shape.minY)
    if (deviationFrom(puzzle.contour, pts) > rules.fidelity * size + 1e-6) errors.push(`The dots stray from the outline of “${name}”.`)
    const room = labelRoom(rules)
    const fill = Math.max((shape.maxX - shape.minX) / (panel.width - room * 2), (shape.maxY - shape.minY) / (panel.height - room * 2))
    if (size < DTD_MIN_PICTURE_INCHES * DPI - 1e-6 || fill < DTD_MIN_FILL - 1e-6) errors.push(`“${name}” prints too small to be the picture.`)
  }

  // Everything on the page.
  const reach = rules.dotRadius + DTD_START_RING + DTD_INK_WIDTH.start
  const inPanel = (x: number, y: number, pad: number) =>
    x - pad >= panel.left - 0.5 && x + pad <= panel.left + panel.width + 0.5 && y - pad >= panel.top - 0.5 && y + pad <= panel.top + panel.height + 0.5
  for (const d of dots) {
    if (!inPanel(d.x, d.y, d.n === 1 ? reach : rules.dotRadius)) errors.push('A dot sits outside the printable area.')
    const l = d.label
    if (!inPanel(l.x, l.y, 0) || !inPanel(l.x - l.w / 2, l.y - l.h / 2, 0) || !inPanel(l.x + l.w / 2, l.y + l.h / 2, 0)) {
      errors.push('A number sits outside the printable area.')
    }
  }
  if (rules.numberSize < DTD_NUMBER_FLOOR_PX) errors.push('The numbers print too small to read.')

  // Every number: clear of every line, dot and other number, and plainly its own dot's.
  const rect = (i: number) => {
    const l = dots[i]!.label
    return { x0: l.x - l.w / 2, y0: l.y - l.h / 2, x1: l.x + l.w / 2, y1: l.y + l.h / 2 }
  }
  const rectDist = (r: ReturnType<typeof rect>, p: Pt) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1))
  const segHits = (r: ReturnType<typeof rect>, a: Pt, b: Pt) => {
    // Sampled finely enough for the few pixels a number spans.
    const steps = Math.max(2, Math.ceil(d2(a, b) / 1.5))
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps
      const y = a.y + ((b.y - a.y) * s) / steps
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true
    }
    return false
  }
  for (let i = 0; i < n; i++) {
    const r = rect(i)
    const own = rectDist(r, pts[i]!)
    for (let j = 0; j < n; j++) {
      if (segHits(r, pts[j]!, pts[(j + 1) % n]!)) {
        errors.push('A number sits on a line the reader will draw.')
        break
      }
    }
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      if (rectDist(r, pts[j]!) < Math.max(own, rules.dotRadius)) {
        errors.push('A number sits nearer another dot than its own.')
        break
      }
      const o = rect(j)
      if (j > i && r.x0 < o.x1 + LABEL_AIR / 2 && o.x0 < r.x1 + LABEL_AIR / 2 && r.y0 < o.y1 + LABEL_AIR / 2 && o.y0 < r.y1 + LABEL_AIR / 2) {
        errors.push('Two numbers overlap.')
        break
      }
    }
    for (const line of puzzle.details) {
      let hit = false
      for (let k = 1; k < line.length && !hit; k++) hit = segHits(r, line[k - 1]!, line[k]!)
      if (hit) {
        errors.push('A number sits on a pre-drawn line.')
        break
      }
    }
  }

  // Details stay details: clear of the outline and on the page.
  for (const line of puzzle.details) {
    if (line.some((p) => !inPanel(p.x, p.y, DTD_INK_WIDTH.detail / 2))) errors.push('A pre-drawn line runs off the page.')
    if (line.some((p) => pts.some((q, j) => distToSegment(p, q, pts[(j + 1) % n]!) < 3))) errors.push('A pre-drawn line touches the outline.')
  }

  // Not a shape the book already prints — unless the theme has none fresh left.
  const entry = dtdDesignEntry(design)
  if (!design.repeat && book.some((e) => e.subject === entry.subject && e.shape === entry.shape)) {
    errors.push(`This book already has a dot-to-dot of this “${name}”.`)
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

/**
 * The page as drawn: one group holding black lines at print weights, filled
 * black dots, the numbers 1 to N once each in black lining digits (each on
 * its dot's spot), and the hidden outline joining the dots in order.
 */
export function checkDtdDrawnPage(options: { picture: StudioFabricObject; box: Box; puzzle: DtdPuzzle; numberSize: number }): string[] {
  const { picture, box, puzzle, numberSize } = options
  const errors: string[] = []
  if (picture.type !== 'group' || !picture.objects?.length) return ['The picture was not drawn.']
  const cx = picture.left + (picture.width ?? 0) / 2
  const cy = picture.top + (picture.height ?? 0) / 2
  if (Math.abs(cx - (box.left + box.width / 2)) > 0.5 || Math.abs(cy - (box.top + box.height / 2)) > 0.5) errors.push('The picture is not where it was laid out.')
  const n = puzzle.dots.length
  const numbers = new Map<number, number>()
  let dots = 0
  let outlines = 0
  for (const child of picture.objects) {
    const part = child.data?.[DTD_PART_KEY]
    if (child.type === 'path') {
      if (child.stroke !== STUDIO_INK || (child.fill && child.fill !== 'transparent')) errors.push('A line is not plain black ink.')
      if (part === 'outline') {
        outlines++
        if (child.visible !== false || child.studioRole !== 'answer') errors.push('The finished outline shows on the puzzle page.')
        const corners = (child.path ?? []).filter((c) => c[0] === 'M' || c[0] === 'L')
        const matches =
          corners.length === n &&
          corners.every((c, i) => Math.abs(Number(c[1]) - puzzle.dots[i]!.x) < 0.02 && Math.abs(Number(c[2]) - puzzle.dots[i]!.y) < 0.02)
        if (!matches) errors.push('The answer outline does not join the dots in order.')
      } else if (part !== 'details' || child.strokeWidth !== DTD_INK_WIDTH.detail) errors.push('The picture holds an unexpected line.')
      continue
    }
    if (child.type === 'circle') {
      if (part === 'dot') {
        dots++
        if (child.fill !== STUDIO_INK) errors.push('A dot is not solid black.')
      } else if (part !== 'start') errors.push('The picture holds an unexpected mark.')
      continue
    }
    if (child.type === 'textbox' && part === 'number') {
      const value = Number(child.text)
      if (!/^[1-9][0-9]*$/.test(String(child.text)) || value > n) errors.push('A number is not on the dot list.')
      else numbers.set(value, (numbers.get(value) ?? 0) + 1)
      if (child.fill !== STUDIO_INK || child.fontFamily !== STUDIO_DIGIT_FONT) errors.push('A number is not printed in black lining digits.')
      if ((child.fontSize ?? 0) !== numberSize || numberSize < DTD_NUMBER_FLOOR_PX) errors.push('A number prints at the wrong size.')
      const dot = puzzle.dots[value - 1]
      if (dot && (Math.abs(child.left + cx - dot.label.x) > 0.02 || Math.abs(child.top + cy - dot.label.y) > 0.02)) errors.push('A number moved away from its dot.')
      continue
    }
    errors.push('The picture holds something other than dots, numbers and lines.')
  }
  if (dots !== n) errors.push('The picture does not have one dot per number.')
  if (outlines !== 1) errors.push('The picture has no answer outline.')
  for (let i = 1; i <= n; i++) {
    if (numbers.get(i) !== 1) {
      errors.push(`Number ${i} is missing or printed twice.`)
      break
    }
  }
  return [...new Set(errors)]
}
