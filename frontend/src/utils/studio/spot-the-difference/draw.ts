import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { ellipseRing, type Pt } from '../stained-glass/geometry'
import { SD_TEMPLATE_KEY } from './content'
import { SD_MARK_OVERHANG, markBounds, type SdMark } from './differences'
import { SD_FRAME_WIDTH, SD_INK_WIDTH, frameRing, type SdLines } from './render'
import { overlaps } from './scene'

/**
 * A finished pair â†’ Fabric objects.
 *
 * Each picture is one group: its frame, its line art as one path per print
 * weight (so a scene of a hundred shapes is a handful of objects in the
 * editor and the export), and, hidden, the answer rings with a numbered
 * badge on each â€” revealed on the answer page, in black. Nothing is filled;
 * the badges alone are white discs, so a number reads over the lines.
 * Strokes are uniform, so resizing a picture in the editor keeps its weights.
 */

/** Marks the objects a Spot the Differences page draws, for checks and the editor. */
export const SD_PART_KEY = 'sdPart'

/** The answer ring's weight: 1.7 pt, heavier than any line in the scene. */
export const SD_RING_WIDTH = 2.25
/** The numbered badge on each ring. */
export const SD_BADGE_R = 0.1 * DPI
export const SD_BADGE_SIZE = 13
/** The tick row's circles. */
const TALLY_R = 0.09 * DPI
const TALLY_STEP = 0.3 * DPI

const r2 = (n: number) => Math.round(n * 100) / 100

function path(lines: readonly (readonly Pt[])[], options: { width: number; closed: boolean; tag: StudioTag; role: StudioRole; part: string; data?: Record<string, unknown> }): StudioFabricObject | null {
  const { width, closed, tag, role, part, data } = options
  const cmds: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    line.forEach((p, i) => {
      cmds.push([i === 0 ? 'M' : 'L', r2(p.x), r2(p.y)])
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
    if (closed && line.length > 0) cmds.push(['Z'])
  }
  if (cmds.length === 0) return null
  return {
    type: 'path',
    path: cmds,
    // A path is placed by the centre of its own geometry (Fabric's pathOffset).
    left: r2((minX + maxX) / 2),
    top: r2((minY + maxY) / 2),
    width: r2(maxX - minX),
    height: r2(maxY - minY),
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: STUDIO_INK,
    strokeWidth: width,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    ...(role === 'answer' ? { visible: false } : {}),
    data: { [SD_PART_KEY]: part, ...data },
  }
}

const shift = (lines: readonly (readonly Pt[])[], dx: number, dy: number) => lines.map((line) => line.map((p) => ({ x: p.x + dx, y: p.y + dy })))

const shiftMark = (m: SdMark, dx: number, dy: number): SdMark => ({ ...m, cx: m.cx + dx, cy: m.cy + dy })

/**
 * Where each ring's number sits: just outside its ring, on the picture, clear
 * of every other ring and number. The first side that fits wins; failing
 * all, the number sits on the ring's top (a white disc over the lines).
 */
export function placeBadges(marks: readonly SdMark[], room: Box): Pt[] {
  const placed: Pt[] = []
  const r = SD_BADGE_R
  const box = (p: Pt) => ({ minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r })
  const inside = (p: Pt) => p.x - r >= room.left && p.x + r <= room.left + room.width && p.y - r >= room.top && p.y + r <= room.top + room.height
  marks.forEach((m, i) => {
    const angles = [-45, -135, 45, 135, 0, 180, -90, 90]
    let spot: Pt | null = null
    for (const a of angles) {
      const t = (a * Math.PI) / 180
      const p = { x: m.cx + (m.rx + r * 0.7) * Math.cos(t), y: m.cy + (m.ry + r * 0.7) * Math.sin(t) }
      if (!inside(p)) continue
      const b = box(p)
      if (marks.some((o, j) => j !== i && overlaps(markBounds(o), b, 1))) continue
      if (placed.some((q) => overlaps(box(q), b, 2))) continue
      spot = p
      break
    }
    placed.push(spot ?? { x: m.cx, y: Math.max(room.top + r, m.cy - m.ry) })
  })
  return placed
}

/** One picture: frame, line art, and the hidden answer rings with their numbers. */
export function buildSdPicture(options: {
  lines: SdLines
  /** Where the picture's panel goes on the page; `lines` and `marks` are drawn relative to (0, 0). */
  box: Box
  marks: readonly SdMark[]
  tag: StudioTag
  which: 'top' | 'bottom'
  /** The page's book label, stamped on the top picture only. */
  label?: string
  canonical: string
}): StudioFabricObject {
  const { lines, box, marks, tag, which, label, canonical } = options
  const dx = box.left
  const dy = box.top
  const parts: StudioFabricObject[] = []
  const frame = path([frameRing({ minX: dx, minY: dy, maxX: dx + box.width, maxY: dy + box.height })], { width: SD_FRAME_WIDTH, closed: true, tag, role: 'prompt', part: 'frame' })
  if (frame) parts.push(frame)
  for (const ink of ['scene', 'part'] as const) {
    const p = path(shift(lines[ink], dx, dy), { width: SD_INK_WIDTH[ink], closed: false, tag, role: 'prompt', part: ink })
    if (p) parts.push(p)
  }
  const placedMarks = marks.map((m) => shiftMark(m, dx, dy))
  placedMarks.forEach((m, i) => {
    const ring = path([ellipseRing(m.cx, m.cy, m.rx, m.ry, 64)], { width: SD_RING_WIDTH, closed: true, tag, role: 'answer', part: 'ring', data: { n: i + 1 } })
    if (ring) parts.push(ring)
  })
  const room: Box = { left: dx - SD_MARK_OVERHANG, top: dy - SD_MARK_OVERHANG, width: box.width + SD_MARK_OVERHANG * 2, height: box.height + SD_MARK_OVERHANG * 2 }
  placeBadges(placedMarks, room).forEach((p, i) => {
    parts.push({
      ...buildCircle({ left: r2(p.x), top: r2(p.y), radius: SD_BADGE_R, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: 1.5, strokeUniform: true }, tag, 'answer'),
      data: { [SD_PART_KEY]: 'badge', n: i + 1 },
    })
    const text = String(i + 1)
    parts.push({
      ...buildText(
        {
          left: r2(p.x),
          top: r2(p.y),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: SD_BADGE_SIZE,
          fontWeight: 700,
          width: SD_BADGE_R * 2,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lineHeight: 1,
          editable: false,
        },
        tag,
        'answer',
      ),
      data: { [SD_PART_KEY]: 'number', n: i + 1 },
    })
  })
  const group = buildGroup(parts, room, tag, 'prompt')
  return {
    ...group,
    data: {
      source: SD_TEMPLATE_KEY,
      [SD_PART_KEY]: which,
      differences: marks.length,
      ...(label ? { [STUDIO_CONTENT_LABEL_KEY]: label } : {}),
      [STUDIO_CANONICAL_KEY]: `${SD_TEMPLATE_KEY}:${canonical}:${which}`,
    },
  }
}

/** "Found:" and one circle per difference, centred in `box` â€” a place to tick each find. */
export function buildSdTally(options: { count: number; box: Box; tag: StudioTag; fontFamily: string }): StudioFabricObject {
  const { count, box, tag, fontFamily } = options
  const size = 16
  const caption = 'Found:'
  const captionW = hugTextBoxWidth(caption, size, box.width, { fontFamily })
  const width = captionW + 10 + count * TALLY_STEP
  const x0 = box.left + (box.width - width) / 2
  const cy = box.top + box.height / 2
  const parts: StudioFabricObject[] = [
    {
      ...buildText({ left: x0, top: cy, text: caption, fontFamily, fontSize: size, width: captionW, originY: 'center', lineHeight: 1, editable: false }, tag, 'prompt'),
      data: { [SD_PART_KEY]: 'tally-caption' },
    },
  ]
  for (let i = 0; i < count; i++) {
    parts.push({
      ...buildCircle({ left: x0 + captionW + 10 + TALLY_STEP * (i + 0.5), top: cy, radius: TALLY_R, stroke: STUDIO_INK, strokeWidth: 1.5, strokeUniform: true }, tag, 'prompt'),
      data: { [SD_PART_KEY]: 'tick', n: i + 1 },
    })
  }
  const group = buildGroup(parts, { left: x0, top: box.top, width, height: box.height }, tag, 'prompt')
  return { ...group, data: { source: SD_TEMPLATE_KEY, [SD_PART_KEY]: 'tally', count } }
}

export interface SdLegendLayout {
  size: number
  columns: number
  colWidth: number
  lineH: number
  height: number
}

const legendText = (n: number, label: string) => `${n}. ${label}`

/**
 * The answer page's list â€” "1. No teacup (top)", "2. Clock changed" â€” in as
 * many columns as fit, at the largest size (11 pt down to 9 pt) that fits
 * `box`; null when even the smallest will not, and the rings stand alone.
 */
export function layoutSdLegend(labels: readonly string[], box: Box, fontFamily: string): SdLegendLayout | null {
  for (const size of [15, 14, 13, 12]) {
    const widest = Math.max(...labels.map((l, i) => hugTextBoxWidth(legendText(i + 1, l), size, Number.POSITIVE_INFINITY, { fontFamily })))
    const colWidth = widest + size * 1.5
    const columns = Math.min(labels.length, Math.max(1, Math.floor(box.width / colWidth)))
    const lineH = Math.ceil(size * 1.4)
    const rows = Math.ceil(labels.length / columns)
    const height = rows * lineH
    if (widest <= box.width && height <= box.height) return { size, columns, colWidth, lineH, height }
  }
  return null
}

/** The legend's entries, hidden like every answer (the answer page reveals them). */
export function buildSdLegend(options: { labels: readonly string[]; box: Box; layout: SdLegendLayout; tag: StudioTag; fontFamily: string }): StudioFabricObject {
  const { labels, box, layout, tag, fontFamily } = options
  const rows = Math.ceil(labels.length / layout.columns)
  const width = layout.columns * layout.colWidth
  const x0 = box.left + (box.width - width) / 2 + layout.size * 0.75
  const y0 = box.top + (box.height - layout.height) / 2
  const parts = labels.map((label, i) => {
    const col = Math.floor(i / rows)
    const row = i % rows
    const text = legendText(i + 1, label)
    return {
      ...buildText(
        {
          left: x0 + col * layout.colWidth,
          top: y0 + row * layout.lineH,
          text,
          fontFamily,
          fontSize: layout.size,
          width: hugTextBoxWidth(text, layout.size, layout.colWidth, { fontFamily }),
          lineHeight: 1.1,
          editable: false,
        },
        tag,
        'answer',
      ),
      data: { [SD_PART_KEY]: 'legend', n: i + 1 },
    }
  })
  const group = buildGroup(parts, { left: box.left + (box.width - width) / 2, top: y0, width, height: layout.height }, tag, 'prompt')
  return { ...group, data: { source: SD_TEMPLATE_KEY, [SD_PART_KEY]: 'legend-block' } }
}
