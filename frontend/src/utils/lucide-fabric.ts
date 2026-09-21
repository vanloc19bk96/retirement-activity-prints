import {
  Circle,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  Polyline,
  Polygon,
  type FabricObject,
} from 'fabric'

/** Lucide `__iconNode` shape: ordered SVG elements in 24×24 viewBox space. */
export type LucideIconNode = ReadonlyArray<
  readonly [string, Readonly<Record<string, string | number | undefined>>]
>

const DEFAULT_STROKE = '#0f172a'
const DEFAULT_STROKE_WIDTH = 2
/** Lucide design space — always scale from this, never content bbox (bbox scale fattens narrow icons). */
export const LUCIDE_VIEWBOX_SIZE = 24
/** Target on-canvas width in abstract (unzoomed) canvas units — matches shapes’ rough default size. */
export const LUCIDE_ICON_TARGET_WIDTH = 72
export const LUCIDE_ICON_GROUP_TYPE = 'lucide-icon'
export const LUCIDE_VIEWBOX_FRAME_KEY = 'lucideViewBoxFrame'

type Attrs = Record<string, string | number | undefined>

function num(attrs: Attrs, key: string, fallback = 0): number {
  const v = attrs[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.length > 0) {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function parsePointsString(points: string | undefined): { x: number; y: number }[] {
  if (!points) return []
  const pairs: { x: number; y: number }[] = []
  for (const chunk of points.trim().split(/\s+/)) {
    const [xs, ys] = chunk.split(',')
    const x = Number.parseFloat(xs ?? '')
    const y = Number.parseFloat(ys ?? '')
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push({ x, y })
  }
  return pairs
}

function isViewBoxFrame(obj: FabricObject): boolean {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.[LUCIDE_VIEWBOX_FRAME_KEY] === true
}

function createViewBoxFrame(): Rect {
  // Keep opacity > 0 so Fabric includes this in group bounds (opacity 0 is skipped).
  const frame = new Rect({
    left: LUCIDE_VIEWBOX_SIZE / 2,
    top: LUCIDE_VIEWBOX_SIZE / 2,
    originX: 'center',
    originY: 'center',
    width: LUCIDE_VIEWBOX_SIZE,
    height: LUCIDE_VIEWBOX_SIZE,
    fill: 'rgba(0,0,0,0)',
    stroke: undefined,
    strokeWidth: 0,
    opacity: 1,
    selectable: false,
    evented: false,
  })
  frame.set('data', { [LUCIDE_VIEWBOX_FRAME_KEY]: true })
  return frame
}

function fabricObjectFromLucideElement(tag: string, rawAttrs: Attrs): FabricObject | null {
  const { key: _k, ...rest } = rawAttrs
  const attrs = rest as Attrs
  const common = {
    fill: 'rgba(0,0,0,0)',
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeUniform: true,
    strokeLineCap: 'round' as const,
    strokeLineJoin: 'round' as const,
  }

  if (tag === 'path') {
    const d = attrs.d
    if (typeof d !== 'string' || d.length === 0) return null
    return new Path(d, {
      ...common,
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'circle') {
    return new Circle({
      ...common,
      radius: num(attrs, 'r', 1),
      left: num(attrs, 'cx'),
      top: num(attrs, 'cy'),
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'ellipse') {
    return new Ellipse({
      ...common,
      rx: num(attrs, 'rx', 1),
      ry: num(attrs, 'ry', 1),
      left: num(attrs, 'cx'),
      top: num(attrs, 'cy'),
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'line') {
    return new Line([num(attrs, 'x1'), num(attrs, 'y1'), num(attrs, 'x2'), num(attrs, 'y2')], {
      ...common,
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'rect') {
    return new Rect({
      ...common,
      left: num(attrs, 'x'),
      top: num(attrs, 'y'),
      width: num(attrs, 'width'),
      height: num(attrs, 'height'),
      rx: num(attrs, 'rx', 0),
      ry: num(attrs, 'ry', num(attrs, 'rx', 0)),
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'polyline') {
    const pts = typeof attrs.points === 'string' ? parsePointsString(attrs.points) : []
    if (pts.length < 2) return null
    return new Polyline(pts, {
      ...common,
      selectable: false,
      evented: false,
    })
  }

  if (tag === 'polygon') {
    const pts = typeof attrs.points === 'string' ? parsePointsString(attrs.points) : []
    if (pts.length < 2) return null
    return new Polygon(pts, {
      ...common,
      selectable: false,
      evented: false,
    })
  }

  return null
}

export function lucideIconNodeToFabricObjects(iconNode: LucideIconNode): FabricObject[] {
  const objects: FabricObject[] = []
  for (const item of iconNode) {
    if (!Array.isArray(item) || item.length < 2) continue
    const tag = item[0]
    const attrs = item[1] as Attrs
    if (typeof tag !== 'string') continue
    const obj = fabricObjectFromLucideElement(tag, attrs)
    if (obj) objects.push(obj)
  }
  return objects
}

export function createFabricIconGroupFromLucideNode(
  iconNode: LucideIconNode,
  options?: { targetWidth?: number },
): Group {
  const glyphChildren = lucideIconNodeToFabricObjects(iconNode)
  const frame = createViewBoxFrame()
  const children =
    glyphChildren.length > 0
      ? [frame, ...glyphChildren]
      : [
          frame,
          new Rect({
            left: LUCIDE_VIEWBOX_SIZE / 2,
            top: LUCIDE_VIEWBOX_SIZE / 2,
            originX: 'center',
            originY: 'center',
            width: LUCIDE_VIEWBOX_SIZE * 0.75,
            height: LUCIDE_VIEWBOX_SIZE * 0.75,
            fill: 'rgba(0,0,0,0)',
            stroke: DEFAULT_STROKE,
            strokeWidth: DEFAULT_STROKE_WIDTH,
            strokeUniform: true,
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
    source: LUCIDE_ICON_GROUP_TYPE,
  })

  const targetWidth = options?.targetWidth ?? LUCIDE_ICON_TARGET_WIDTH
  const scale = Math.max(1, targetWidth) / LUCIDE_VIEWBOX_SIZE
  // Pin design-space size so child stroke padding cannot inflate the box.
  group.set({
    width: LUCIDE_VIEWBOX_SIZE,
    height: LUCIDE_VIEWBOX_SIZE,
    scaleX: scale,
    scaleY: scale,
  })
  group.setCoords()
  return group
}

export function isLucideViewBoxFrame(obj: unknown): boolean {
  return isViewBoxFrame(obj as FabricObject)
}

export function isLucideIconGroup(target: unknown): target is Group {
  const group = target as {
    data?: { source?: unknown }
    getObjects?: () => Array<{ type?: unknown; strokeUniform?: unknown; data?: unknown }>
  } | null
  if (group?.data?.source === LUCIDE_ICON_GROUP_TYPE) return true
  const children = group?.getObjects?.() ?? []
  if (children.length === 0) return false
  return children.every((child) => {
    if (isViewBoxFrame(child as FabricObject)) return true
    const type = String(child?.type ?? '')
    if (!['path', 'line', 'circle', 'ellipse', 'rect', 'polyline', 'polygon'].includes(type)) {
      return false
    }
    return child?.strokeUniform === true
  })
}
