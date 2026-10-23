import type { Canvas, FabricObject } from 'fabric'

import type { BookCoverZones, ZoneRect } from '@/types/book-cover.types'
import { DPI, type MarginGuide } from '@/types/canvas-settings.types'
import { getLayerId, getLayerKind, getLayerName, getListedLayerObjects, type LayerKind } from '@/utils/canvas-layers'

/**
 * Print checks for the cover or one interior page, run on the live canvas. They catch what most
 * often gets a KDP upload rejected or printed badly: text past the margins, art that stops short
 * of the bleed, low-resolution images, and things that silently won't print.
 */

export type PreflightSeverity = 'error' | 'warning' | 'info'

export type PreflightRuleId =
  | 'off-page'
  | 'text-outside-safe-area'
  | 'spine-text'
  | 'low-resolution'
  | 'bleed-gap'
  | 'cut-at-edge'
  | 'barcode-area'
  | 'hidden-layer'
  | 'empty-text'

export type PreflightIssue = {
  id: string
  ruleId: PreflightRuleId
  severity: PreflightSeverity
  title: string
  detail: string
  layerId: string
  layerName: string
}

export type Rect = { left: number; top: number; right: number; bottom: number }

type BleedSides = { left: boolean; right: boolean; top: boolean; bottom: boolean }

export type PreflightSurface = {
  kind: 'interior' | 'cover'
  /** The whole canvas, bleed included. */
  page: Rect
  /** Where the paper is cut (or folded, at the inside edge of an interior page). */
  trim: Rect
  /** Text must sit entirely inside one of these. */
  safeAreas: Rect[]
  /** Sides that have bleed: art crossing the trim there must run to the page edge. */
  bleedSides: BleedSides
  hasBleed: boolean
  spine?: Rect
  /** Null when the spine is too thin to hold text. */
  spineSafeArea?: Rect | null
  barcodeArea?: Rect
  backCover?: Rect
}

/** What the rules need to know about one layer; built from Fabric objects by {@link collectPreflightItems}. */
export type PreflightItem = {
  layerId: string
  layerName: string
  kind: LayerKind
  isVisible: boolean
  bounds: Rect
  isText: boolean
  isEmptyText: boolean
  /** Lowest print resolution of the images in this layer; null when it has none. */
  imageDpi: number | null
}

export const MIN_RECOMMENDED_IMAGE_DPI = 300
export const MIN_ACCEPTABLE_IMAGE_DPI = 150

/** Rounding and anti-aliasing leave objects a hair past an edge; ignore anything under a pixel. */
const EDGE_TOLERANCE_PX = 1
/** Back-cover art this large is a background or panel, not something placed over the barcode. */
const BACKGROUND_AREA_RATIO = 0.6

const SEVERITY_ORDER: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 }

function zoneToRect(zone: ZoneRect): Rect {
  return { left: zone.x, top: zone.y, right: zone.x + zone.width, bottom: zone.y + zone.height }
}

function rectArea(rect: Rect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top)
}

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.left >= outer.left - EDGE_TOLERANCE_PX &&
    inner.top >= outer.top - EDGE_TOLERANCE_PX &&
    inner.right <= outer.right + EDGE_TOLERANCE_PX &&
    inner.bottom <= outer.bottom + EDGE_TOLERANCE_PX
  )
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right - EDGE_TOLERANCE_PX &&
    a.right > b.left + EDGE_TOLERANCE_PX &&
    a.top < b.bottom - EDGE_TOLERANCE_PX &&
    a.bottom > b.top + EDGE_TOLERANCE_PX
  )
}

function formatInches(pixels: number): string {
  return `${Math.round((pixels / DPI) * 1000) / 1000} in`
}

export function buildInteriorPreflightSurface(args: {
  width: number
  height: number
  marginGuide: MarginGuide
  /** Verso page: its outside edge (the one with bleed) is on the left. */
  isLeftPage: boolean
  hasBleed: boolean
}): PreflightSurface {
  const { width, height, marginGuide: m, isLeftPage, hasBleed } = args
  const trim: Rect = {
    left: isLeftPage ? m.bleedOutsidePixels : 0,
    top: m.bleedTopPixels,
    right: isLeftPage ? width : width - m.bleedOutsidePixels,
    bottom: height - m.bleedBottomPixels,
  }
  const outsideSafe = m.bleedOutsidePixels + m.outsidePixels
  const safeArea: Rect = {
    left: isLeftPage ? outsideSafe : m.insidePixels,
    top: m.bleedTopPixels + m.topPixels,
    right: width - (isLeftPage ? m.insidePixels : outsideSafe),
    bottom: height - m.bleedBottomPixels - m.bottomPixels,
  }
  return {
    kind: 'interior',
    page: { left: 0, top: 0, right: width, bottom: height },
    trim,
    safeAreas: [safeArea],
    // The inside edge is bound into the spine, so it never has bleed.
    bleedSides: {
      left: hasBleed && isLeftPage,
      right: hasBleed && !isLeftPage,
      top: hasBleed,
      bottom: hasBleed,
    },
    hasBleed,
  }
}

export function buildCoverPreflightSurface(zones: BookCoverZones): PreflightSurface {
  const backCover = zoneToRect(zones.backCover)
  const frontCover = zoneToRect(zones.frontCover)
  const spineSafeArea = zones.spineSafeArea.width > 0 ? zoneToRect(zones.spineSafeArea) : null
  return {
    kind: 'cover',
    page: zoneToRect(zones.bleed),
    trim: { left: backCover.left, top: backCover.top, right: frontCover.right, bottom: frontCover.bottom },
    safeAreas: [zoneToRect(zones.backSafeArea), zoneToRect(zones.frontSafeArea), ...(spineSafeArea ? [spineSafeArea] : [])],
    bleedSides: { left: true, right: true, top: true, bottom: true },
    hasBleed: true,
    spine: zoneToRect(zones.spine),
    spineSafeArea,
    barcodeArea: zoneToRect(zones.barcodeArea),
    backCover,
  }
}

type Finding = Omit<PreflightIssue, 'id' | 'layerId' | 'layerName'>

function textPlacementFinding(item: PreflightItem, surface: PreflightSurface): Finding | null {
  if (surface.safeAreas.some((area) => isInside(item.bounds, area))) return null

  if (surface.spine && intersects(item.bounds, surface.spine)) {
    return {
      ruleId: 'spine-text',
      severity: 'warning',
      title: "Spine text doesn't fit",
      detail: surface.spineSafeArea
        ? `Spine text must stay ${formatInches(surface.spineSafeArea.left - surface.spine.left)} inside each fold. Make it smaller or shorter.`
        : 'This spine is too thin for text. Add pages to the book or remove the spine text.',
    }
  }

  return {
    ruleId: 'text-outside-safe-area',
    severity: 'warning',
    title: surface.kind === 'cover' ? 'Text outside the safe area' : 'Text outside the margins',
    detail:
      surface.kind === 'cover'
        ? 'Keep text 0.125 in inside the trim so it isn’t cut off.'
        : 'KDP can reject text outside the margins. Move it inside the red dashed line.',
  }
}

/** The strip between an object's edge and the page edge on one side, across the object's span. */
function gapStrip(bounds: Rect, page: Rect, side: 'left' | 'right' | 'top' | 'bottom'): Rect {
  if (side === 'left') return { ...bounds, left: page.left, right: bounds.left }
  if (side === 'right') return { ...bounds, left: bounds.right, right: page.right }
  if (side === 'top') return { ...bounds, top: page.top, bottom: bounds.top }
  return { ...bounds, top: bounds.bottom, bottom: page.bottom }
}

function edgeFinding(item: PreflightItem, surface: PreflightSurface, items: readonly PreflightItem[]): Finding | null {
  const b = item.bounds
  const { trim, page, bleedSides } = surface
  const crossings = {
    left: b.left < trim.left - EDGE_TOLERANCE_PX,
    right: b.right > trim.right + EDGE_TOLERANCE_PX,
    top: b.top < trim.top - EDGE_TOLERANCE_PX,
    bottom: b.bottom > trim.bottom + EDGE_TOLERANCE_PX,
  }
  const gaps = {
    left: b.left > page.left + EDGE_TOLERANCE_PX,
    right: b.right < page.right - EDGE_TOLERANCE_PX,
    top: b.top > page.top + EDGE_TOLERANCE_PX,
    bottom: b.bottom < page.bottom - EDGE_TOLERANCE_PX,
  }
  const sides = ['left', 'right', 'top', 'bottom'] as const

  if (sides.some((side) => crossings[side] && !bleedSides[side])) {
    return {
      ruleId: 'cut-at-edge',
      severity: 'warning',
      title: 'Cut off at the page edge',
      detail: surface.hasBleed
        ? 'The inside edge has no bleed, so this part is lost in the binding. Keep it inside the page.'
        : 'Part of this goes past the trim and will be cut off. Turn on bleed in Settings for edge-to-edge art, or keep it inside the page.',
    }
  }
  // A gap only shows as a white strip when nothing else (say, a full-bleed background) fills it.
  const isGapFilled = (side: (typeof sides)[number]): boolean => {
    const strip = gapStrip(b, page, side)
    return items.some(
      (other) => other !== item && other.isVisible && !other.isText && isInside(strip, other.bounds),
    )
  }
  if (sides.some((side) => crossings[side] && bleedSides[side] && gaps[side] && !isGapFilled(side))) {
    return {
      ruleId: 'bleed-gap',
      severity: 'warning',
      title: "Doesn't reach the bleed edge",
      detail: 'It goes past the trim but stops short of the page edge, so a thin white strip can show after cutting. Stretch it to the edge.',
    }
  }
  return null
}

function imageFinding(item: PreflightItem): Finding | null {
  if (item.imageDpi === null || item.imageDpi >= MIN_RECOMMENDED_IMAGE_DPI) return null
  const dpi = Math.round(item.imageDpi)
  const isBlurry = item.imageDpi < MIN_ACCEPTABLE_IMAGE_DPI
  return {
    ruleId: 'low-resolution',
    severity: isBlurry ? 'error' : 'warning',
    title: isBlurry ? `Blurry in print (${dpi} DPI)` : `Low resolution (${dpi} DPI)`,
    detail: `KDP recommends ${MIN_RECOMMENDED_IMAGE_DPI} DPI. Use a larger image, or make this one smaller on the page.`,
  }
}

function barcodeFinding(item: PreflightItem, surface: PreflightSurface): Finding | null {
  const { barcodeArea, backCover } = surface
  if (!barcodeArea || !backCover || !intersects(item.bounds, barcodeArea)) return null
  if (rectArea(item.bounds) >= rectArea(backCover) * BACKGROUND_AREA_RATIO) return null
  return {
    ruleId: 'barcode-area',
    severity: 'warning',
    title: 'Covers the barcode area',
    detail: 'KDP prints the barcode here (2 × 1.2 in, bottom right of the back cover). Move this out of the way.',
  }
}

export function evaluatePreflight(items: readonly PreflightItem[], surface: PreflightSurface): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const add = (item: PreflightItem, finding: Finding | null): void => {
    if (!finding) return
    issues.push({ ...finding, id: `${finding.ruleId}:${item.layerId}`, layerId: item.layerId, layerName: item.layerName })
  }

  for (const item of items) {
    if (!item.isVisible) {
      add(item, {
        ruleId: 'hidden-layer',
        severity: 'info',
        title: "Hidden layer won't print",
        detail: 'Show it if it belongs in the book, or delete it.',
      })
      continue
    }
    if (!intersects(item.bounds, surface.page)) {
      add(item, {
        ruleId: 'off-page',
        severity: 'warning',
        title: 'Outside the page',
        detail: "It won't be printed. Move it onto the page or delete it.",
      })
      continue
    }
    if (item.isText) {
      if (item.isEmptyText) {
        add(item, { ruleId: 'empty-text', severity: 'info', title: 'Empty text box', detail: 'Type something in it or delete it.' })
        continue
      }
      add(item, textPlacementFinding(item, surface))
    } else {
      add(item, edgeFinding(item, surface, items))
    }
    add(item, imageFinding(item))
    add(item, barcodeFinding(item, surface))
  }

  // Most severe first; the sort is stable, so within a severity the layer order (frontmost first) holds.
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

function boundsOf(object: FabricObject): Rect {
  const box = object.getBoundingRect()
  return { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height }
}

/** Stand-in for an image on a page checked from its JSON (book-preflight.ts), sized like it but never downloaded. */
export const PREFLIGHT_IMAGE_KEY = 'preflightImage'

function isImageLayer(object: FabricObject): boolean {
  const data = (object as FabricObject & { data?: Record<string, unknown> | null }).data
  return String(object.type).toLowerCase() === 'image' || data?.[PREFLIGHT_IMAGE_KEY] === true
}

function lowestImageDpi(object: FabricObject): number | null {
  if (isImageLayer(object)) {
    // Fabric draws one source pixel per unit of an image's width, so its print DPI is 96 / scale.
    const scale = object.getObjectScaling().x
    return scale > 0 ? DPI / scale : null
  }
  const children = (object as FabricObject & { getObjects?: () => FabricObject[] }).getObjects?.() ?? []
  let lowest: number | null = null
  for (const child of children) {
    const dpi = lowestImageDpi(child)
    if (dpi !== null && (lowest === null || dpi < lowest)) lowest = dpi
  }
  return lowest
}

/** Layers frontmost first, like the Layers panel, so issues read in the same order. */
export function collectPreflightItems(canvas: Canvas): PreflightItem[] {
  return getListedLayerObjects(canvas)
    .reverse()
    .map((object) => {
      const kind = getLayerKind(object)
      const isText = kind === 'text'
      const text = (object as FabricObject & { text?: unknown }).text
      return {
        layerId: getLayerId(object),
        layerName: getLayerName(object),
        kind,
        isVisible: object.visible !== false,
        bounds: boundsOf(object),
        isText,
        isEmptyText: isText && (typeof text !== 'string' || text.trim().length === 0),
        imageDpi: lowestImageDpi(object),
      }
    })
}

export function summarizePreflight(issues: readonly PreflightIssue[]): Record<PreflightSeverity, number> {
  const summary: Record<PreflightSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const issue of issues) summary[issue.severity] += 1
  return summary
}
