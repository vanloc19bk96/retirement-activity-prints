import { Group, Path, Rect } from 'fabric'
import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_PAPER } from '@/constants/studio.constants'
import { LUCIDE_VIEWBOX_FRAME_KEY } from '@/utils/lucide-fabric'
import { nextObjectId, type StudioTag } from '../studio-fabric-builders'
import type { RelicAttrs, RelicDrawing, RelicElement } from './drawings'

/**
 * An Office Relics drawing → one Studio Fabric group, in black ink.
 *
 * Every element becomes path data, whatever SVG shape it was written as. A
 * path is positioned by its own coordinates, so a rect or a circle lands
 * exactly where the drawing put it — no origin defaults to get wrong — and it
 * exports to the PDF as the same vector it is on screen.
 *
 * Consecutive elements that share a style are merged into one path. A drawing
 * of forty keys and ticks becomes a handful of objects, which keeps a page of
 * nine pictures light in the editor and in the export, while the order of
 * paper-filled parts (a slip of paper covering the spike behind it) is kept.
 *
 * Line weights are absolute print weights with `strokeUniform`, so every
 * picture on a page — and on every page of a book — is drawn with the same
 * pen, however large or small its own drawing was scaled.
 */

const n = (value: string | number | undefined, fallback = 0): number => {
  const v = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(v) ? v : fallback
}

function rectPath(a: RelicAttrs): string {
  const x = n(a.x)
  const y = n(a.y)
  const w = n(a.width)
  const h = n(a.height)
  const r = Math.max(0, Math.min(n(a.rx), w / 2, h / 2))
  if (r === 0) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`
  return (
    `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
    `V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
    `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  )
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
}

function pointsPath(points: string | number | undefined, close: boolean): string {
  const pts = String(points ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
  if (pts.length < 2) return ''
  const [first, ...rest] = pts
  return `M${first![0]} ${first![1]} ${rest.map(([x, y]) => `L${x} ${y}`).join(' ')}${close ? ' Z' : ''}`
}

/** One element as SVG path data. */
export function elementPathData([shape, a]: RelicElement): string {
  switch (shape) {
    case 'path':
      return String(a.d ?? '')
    case 'rect':
      return rectPath(a)
    case 'circle':
      return ellipsePath(n(a.cx), n(a.cy), n(a.r), n(a.r))
    case 'ellipse':
      return ellipsePath(n(a.cx), n(a.cy), n(a.rx), n(a.ry))
    case 'line':
      return `M${n(a.x1)} ${n(a.y1)} L${n(a.x2)} ${n(a.y2)}`
    case 'polyline':
      return pointsPath(a.points, false)
    case 'polygon':
      return pointsPath(a.points, true)
  }
}

type RelicStyle = 'main' | 'fine' | 'ink' | 'paper'

export function elementStyle([, a]: RelicElement): RelicStyle {
  if (a.fill === 'ink') return 'ink'
  if (a.fill === 'paper') return 'paper'
  return a.fine ? 'fine' : 'main'
}

/** Runs of consecutive same-style elements, each as one path. */
export function mergedRuns(drawing: RelicDrawing): { style: RelicStyle; d: string }[] {
  const runs: { style: RelicStyle; d: string }[] = []
  for (const element of drawing.elements) {
    const style = elementStyle(element)
    const d = elementPathData(element)
    if (!d) continue
    const last = runs[runs.length - 1]
    // Paper shapes each hide what is behind them, so they are never merged:
    // a merged path is filled as one, and would hide its own earlier pieces.
    if (last && last.style === style && style !== 'paper') last.d += ` ${d}`
    else runs.push({ style, d })
  }
  return runs
}

export interface RelicPictureSpec {
  /** Centre of the box the picture is fitted into. */
  centerX: number
  centerY: number
  /** Box the whole drawing must fit inside, strokes included. */
  boxWidth: number
  boxHeight: number
  /** Print weight of outlines, in canvas px. */
  stroke: number
  /** Print weight of inner detail, in canvas px. */
  fineStroke: number
}

/**
 * Air kept round the ink, in design units. At least half the heaviest pen, so
 * no stroke reaches past the frame and the group stays centred on its drawing.
 */
const FRAME_PAD = 2

export interface RelicInkBox {
  left: number
  top: number
  width: number
  height: number
}

function runPaths(drawing: RelicDrawing, spec: Pick<RelicPictureSpec, 'stroke' | 'fineStroke'>): Path[] {
  return mergedRuns(drawing).map(({ style, d }) => {
    const fill = style === 'ink' ? STUDIO_INK : style === 'paper' ? STUDIO_PAPER : 'transparent'
    return new Path(d, {
      fill,
      stroke: STUDIO_INK,
      strokeWidth: style === 'fine' ? spec.fineStroke : spec.stroke,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      selectable: false,
      evented: false,
    })
  })
}

const inkCache = new WeakMap<RelicDrawing, RelicInkBox>()

/**
 * The box the drawing's ink actually covers, plus `FRAME_PAD`, measured from
 * the same path geometry Fabric draws (curves and arcs exactly).
 *
 * Pictures are framed on this rather than on the drawing's design canvas, so
 * a drawing that leaves more air on one side than another is still centred in
 * its card, and every picture is scaled by what a reader sees.
 */
export function relicInkBox(drawing: RelicDrawing): RelicInkBox {
  const cached = inkCache.get(drawing)
  if (cached) return cached
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const path of runPaths(drawing, { stroke: 0, fineStroke: 0 })) {
    // A path is centred on its own geometry, and `width`/`height` are that geometry's extent.
    const w = path.width ?? 0
    const h = path.height ?? 0
    minX = Math.min(minX, path.left - w / 2)
    maxX = Math.max(maxX, path.left + w / 2)
    minY = Math.min(minY, path.top - h / 2)
    maxY = Math.max(maxY, path.top + h / 2)
  }
  const box = {
    left: minX - FRAME_PAD,
    top: minY - FRAME_PAD,
    width: maxX - minX + FRAME_PAD * 2,
    height: maxY - minY + FRAME_PAD * 2,
  }
  inkCache.set(drawing, box)
  return box
}

/** Uniform scale that fits the drawing's ink, strokes and all, inside its box. */
export function relicPictureScale(drawing: RelicDrawing, spec: RelicPictureSpec): number {
  const ink = relicInkBox(drawing)
  const room = spec.stroke
  return Math.max(0.01, Math.min((spec.boxWidth - room) / ink.width, (spec.boxHeight - room) / ink.height))
}

export function buildRelicPicture(
  drawing: RelicDrawing,
  spec: RelicPictureSpec,
  tag: StudioTag,
  data: Record<string, unknown>,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  const ink = relicInkBox(drawing)
  const children = runPaths(drawing, spec)

  // Pins the group to the ink box, so the picture is placed and scaled by its
  // drawing rather than by how far a stroke happens to reach.
  const frame = new Rect({
    left: ink.left + ink.width / 2,
    top: ink.top + ink.height / 2,
    originX: 'center',
    originY: 'center',
    width: ink.width,
    height: ink.height,
    fill: 'rgba(0,0,0,0)',
    strokeWidth: 0,
    selectable: false,
    evented: false,
  })
  frame.set('data', { [LUCIDE_VIEWBOX_FRAME_KEY]: true })

  const scale = relicPictureScale(drawing, spec)
  const group = new Group([frame, ...children], {
    originX: 'center',
    originY: 'center',
    subTargetCheck: false,
  })
  group.set({
    left: spec.centerX,
    top: spec.centerY,
    width: ink.width,
    height: ink.height,
    scaleX: scale,
    scaleY: scale,
  })
  group.setCoords()

  const serialized = group.toObject(['data'] as never) as unknown as StudioFabricObject
  group.dispose()

  return {
    ...serialized,
    data: { ...(serialized.data ?? {}), source: 'office-relic', ...data },
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
  }
}
