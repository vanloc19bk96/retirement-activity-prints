import { Group, Path, Rect, type FabricObject } from 'fabric'

/** Phosphor design space — scale from this, never content bbox. */
export const PHOSPHOR_VIEWBOX_SIZE = 256
export const PHOSPHOR_ICON_GROUP_TYPE = 'phosphor-icon'
export const PHOSPHOR_VIEWBOX_FRAME_KEY = 'phosphorViewBoxFrame'
/** Duotone secondary (light) path — painted gray; primary is the dark outline. */
export const PHOSPHOR_DUOTONE_SECONDARY_KEY = 'phosphorDuotoneSecondary'

/** Softened outline (duotone primary is path-fill geometry, not strokeWidth). */
const DEFAULT_PRIMARY_FILL = '#4B4B4B'
const DEFAULT_SECONDARY_FILL = '#D6D6D6'

export interface PhosphorSvgPath {
  d: string
  /** True when SVG marks the path with opacity < 1 (duotone soft layer). */
  isSecondary: boolean
}

function createViewBoxFrame(): Rect {
  // Keep opacity > 0 so Fabric includes this in group bounds (opacity 0 is skipped).
  const frame = new Rect({
    left: PHOSPHOR_VIEWBOX_SIZE / 2,
    top: PHOSPHOR_VIEWBOX_SIZE / 2,
    originX: 'center',
    originY: 'center',
    width: PHOSPHOR_VIEWBOX_SIZE,
    height: PHOSPHOR_VIEWBOX_SIZE,
    fill: 'rgba(0,0,0,0)',
    stroke: undefined,
    strokeWidth: 0,
    opacity: 1,
    selectable: false,
    evented: false,
  })
  frame.set('data', { [PHOSPHOR_VIEWBOX_FRAME_KEY]: true })
  return frame
}

/**
 * Phosphor duotone SVGs: secondary path (opacity≈0.2) + primary outline path.
 * Extract path `d` and whether each path is the soft secondary layer.
 */
export function parsePhosphorSvgPaths(svg: string): PhosphorSvgPath[] {
  const paths: PhosphorSvgPath[] = []
  const re = /<path\b([^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(svg)) !== null) {
    const attrs = match[1] ?? ''
    const dMatch = /\bd="([^"]+)"/i.exec(attrs)
    const d = dMatch?.[1]?.trim()
    if (!d) continue
    const opacityMatch = /\bopacity="([^"]+)"/i.exec(attrs)
    const opacity = opacityMatch ? Number.parseFloat(opacityMatch[1]) : 1
    const isSecondary = Number.isFinite(opacity) && opacity > 0 && opacity < 1
    paths.push({ d, isSecondary })
  }
  return paths
}

function fabricObjectsFromPaths(pathData: readonly PhosphorSvgPath[]): FabricObject[] {
  return pathData.map((entry) => {
    const path = new Path(entry.d, {
      fill: entry.isSecondary ? DEFAULT_SECONDARY_FILL : DEFAULT_PRIMARY_FILL,
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1,
      selectable: false,
      evented: false,
    })
    if (entry.isSecondary) {
      path.set('data', { [PHOSPHOR_DUOTONE_SECONDARY_KEY]: true })
    }
    return path
  })
}

export function createFabricIconGroupFromPhosphorSvg(
  svg: string,
  options?: { targetWidth?: number },
): Group {
  const glyphChildren = fabricObjectsFromPaths(parsePhosphorSvgPaths(svg))
  const frame = createViewBoxFrame()
  const children =
    glyphChildren.length > 0
      ? [frame, ...glyphChildren]
      : [
          frame,
          new Rect({
            left: PHOSPHOR_VIEWBOX_SIZE / 2,
            top: PHOSPHOR_VIEWBOX_SIZE / 2,
            originX: 'center',
            originY: 'center',
            width: PHOSPHOR_VIEWBOX_SIZE * 0.6,
            height: PHOSPHOR_VIEWBOX_SIZE * 0.6,
            fill: DEFAULT_PRIMARY_FILL,
            stroke: undefined,
            strokeWidth: 0,
            selectable: false,
            evented: false,
          }),
        ]

  const group = new Group(children, {
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    subTargetCheck: true,
  })
  ;(group as unknown as { set: (key: string, value: unknown) => void }).set('data', {
    source: PHOSPHOR_ICON_GROUP_TYPE,
  })

  const targetWidth = options?.targetWidth ?? 72
  const scale = Math.max(1, targetWidth) / PHOSPHOR_VIEWBOX_SIZE
  group.set({
    width: PHOSPHOR_VIEWBOX_SIZE,
    height: PHOSPHOR_VIEWBOX_SIZE,
    scaleX: scale,
    scaleY: scale,
  })
  group.setCoords()
  return group
}

function isTransparentFill(fill: unknown): boolean {
  if (typeof fill !== 'string' || fill.length === 0) return true
  if (fill === 'transparent') return true
  return /rgba?\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(fill)
}

function isViewBoxSizedRect(obj: FabricObject): boolean {
  if (String(obj.type ?? '') !== 'rect') return false
  const width = Number((obj as FabricObject & { width?: unknown }).width)
  const height = Number((obj as FabricObject & { height?: unknown }).height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  // Allow tiny float drift after serialize/enliven.
  return Math.abs(width - PHOSPHOR_VIEWBOX_SIZE) < 1 && Math.abs(height - PHOSPHOR_VIEWBOX_SIZE) < 1
}

export function isPhosphorViewBoxFrame(obj: unknown): boolean {
  const fabricObj = obj as FabricObject & { data?: Record<string, unknown> }
  if (fabricObj?.data?.[PHOSPHOR_VIEWBOX_FRAME_KEY] === true) return true
  // Legacy studio JSON omitted child `data` — detect the transparent viewBox rect.
  return isViewBoxSizedRect(fabricObj) && isTransparentFill(fabricObj.fill)
}

export function isPhosphorDuotoneSecondary(obj: unknown): boolean {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.[PHOSPHOR_DUOTONE_SECONDARY_KEY] === true
}

export function isPhosphorIconGroup(target: unknown): target is Group {
  const group = target as {
    data?: { source?: unknown }
    getObjects?: () => unknown[]
  } | null
  return group?.data?.source === PHOSPHOR_ICON_GROUP_TYPE
}

/** Props Fabric must keep so duotone frame/secondary markers survive toObject/enliven. */
export const PHOSPHOR_SERIALIZE_PROPS: string[] = ['data']

function getPhosphorGlyphChildren(group: {
  getObjects?: () => FabricObject[]
}): FabricObject[] {
  return (group.getObjects?.() ?? []).filter((child) => !isPhosphorViewBoxFrame(child))
}

/**
 * Duotone SVG order is secondary then primary. When child `data` was dropped by
 * toObject(), fall back to that order so toolbar fill never paints the viewBox frame.
 */
function splitPhosphorGlyphLayers(glyphs: FabricObject[]): {
  primary: FabricObject[]
  secondary: FabricObject[]
} {
  const markedSecondary = glyphs.filter((child) => isPhosphorDuotoneSecondary(child))
  if (markedSecondary.length > 0) {
    return {
      secondary: markedSecondary,
      primary: glyphs.filter((child) => !isPhosphorDuotoneSecondary(child)),
    }
  }
  if (glyphs.length >= 2) {
    return { secondary: [glyphs[0]!], primary: glyphs.slice(1) }
  }
  return { secondary: [], primary: glyphs }
}

function readChildFill(obj: FabricObject): string | undefined {
  const fill = (obj as FabricObject & { fill?: unknown }).fill
  if (typeof fill !== 'string' || fill.length === 0 || isTransparentFill(fill)) return undefined
  return fill
}

/** Primary (outline) fill — maps to toolbar stroke color for duotone icons. */
export function readPhosphorPrimaryFill(group: unknown): string | undefined {
  if (!isPhosphorIconGroup(group)) return undefined
  const { primary } = splitPhosphorGlyphLayers(getPhosphorGlyphChildren(group))
  for (const child of primary) {
    const fill = readChildFill(child)
    if (fill) return fill
  }
  return undefined
}

/** Secondary (soft) fill — maps to toolbar fill color for duotone icons. */
export function readPhosphorSecondaryFill(group: unknown): string | undefined {
  if (!isPhosphorIconGroup(group)) return undefined
  const { secondary, primary } = splitPhosphorGlyphLayers(getPhosphorGlyphChildren(group))
  for (const child of secondary) {
    const fill = readChildFill(child)
    if (fill) return fill
  }
  // Single-layer icons: expose primary as fill so the toolbar still shows a real color.
  for (const child of primary) {
    const fill = readChildFill(child)
    if (fill) return fill
  }
  return undefined
}

export function applyPhosphorPrimaryFill(group: unknown, color: string): void {
  if (!isPhosphorIconGroup(group)) return
  const { primary } = splitPhosphorGlyphLayers(getPhosphorGlyphChildren(group))
  for (const child of primary) {
    child.set({ fill: color, stroke: undefined, strokeWidth: 0, opacity: 1 })
  }
}

export function applyPhosphorSecondaryFill(group: unknown, color: string): void {
  if (!isPhosphorIconGroup(group)) return
  const { secondary, primary } = splitPhosphorGlyphLayers(getPhosphorGlyphChildren(group))
  const targets = secondary.length > 0 ? secondary : primary
  for (const child of targets) {
    child.set({ fill: color, stroke: undefined, strokeWidth: 0, opacity: 1 })
  }
}
