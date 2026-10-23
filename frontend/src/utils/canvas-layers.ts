import { ActiveSelection, type Canvas, type FabricObject } from 'fabric'

import { isObjectLocked, setObjectLocked } from '@/utils/canvas-lock'
import { isLucideIconGroup } from '@/utils/lucide-fabric'
import { isPhosphorIconGroup } from '@/utils/phosphor-fabric'

export type LayerKind = 'text' | 'image' | 'shape' | 'circle' | 'triangle' | 'line' | 'icon' | 'group' | 'drawing'

/** One row of the Layers panel. Plain data so React can diff it; the Fabric object is looked up by `id`. */
export type CanvasLayer = {
  id: string
  kind: LayerKind
  name: string
  hasCustomName: boolean
  isVisible: boolean
  isLocked: boolean
  isSelected: boolean
}

export type LayerPlacement = 'above' | 'below'

export type LayerSelectionMode = 'replace' | 'toggle' | 'range'

type LayerObject = FabricObject & {
  layerName?: unknown
  text?: unknown
  isEraserPath?: unknown
  customShapeType?: unknown
}

export const LAYER_NAME_MAX_LENGTH = 60
const TEXT_NAME_MAX_LENGTH = 40

const KIND_NAMES: Record<LayerKind, string> = {
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  circle: 'Circle',
  triangle: 'Triangle',
  line: 'Line',
  icon: 'Icon',
  group: 'Group',
  drawing: 'Drawing',
}

const SHAPE_NAMES: Record<string, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  polyline: 'Polyline',
}

// Fabric objects carry no stable id; the panel keys rows by object identity.
const layerIds = new WeakMap<FabricObject, string>()
let nextLayerId = 0

export function getLayerId(object: FabricObject): string {
  let id = layerIds.get(object)
  if (!id) {
    nextLayerId += 1
    id = `layer-${nextLayerId}`
    layerIds.set(object, id)
  }
  return id
}

/** Transient helpers (pen-tool drafts, legacy eraser paths) live on the canvas but are not the user's layers. */
export function isListedLayer(object: FabricObject): boolean {
  const layer = object as LayerObject
  if (layer.isEraserPath) return false
  return !(layer.selectable === false && layer.evented === false)
}

export function getLayerKind(object: FabricObject): LayerKind {
  const layer = object as LayerObject
  const type = String(layer.type ?? '').toLowerCase()
  if (type === 'textbox' || type === 'i-text' || type === 'text') {
    return 'text'
  }
  if (type === 'image') return 'image'
  if (isLucideIconGroup(object) || isPhosphorIconGroup(object)) return 'icon'
  if (type === 'group') return 'group'
  if (type === 'line' || layer.customShapeType === 'line' || layer.customShapeType === 'arrow') return 'line'
  if (type === 'path') return 'drawing'
  if (type === 'circle') return 'circle'
  if (type === 'triangle') return 'triangle'
  return 'shape'
}

function readCustomName(object: FabricObject): string | null {
  const value = (object as LayerObject).layerName
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function textSnippet(object: FabricObject): string | null {
  const text = (object as LayerObject).text
  if (typeof text !== 'string') return null
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (!singleLine) return null
  return singleLine.length > TEXT_NAME_MAX_LENGTH
    ? `${singleLine.slice(0, TEXT_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : singleLine
}

export function getLayerName(object: FabricObject): string {
  const customName = readCustomName(object)
  if (customName) return customName
  const kind = getLayerKind(object)
  if (kind === 'text') return textSnippet(object) ?? KIND_NAMES.text
  if (kind === 'shape') return SHAPE_NAMES[String(object.type ?? '').toLowerCase()] ?? KIND_NAMES.shape
  return KIND_NAMES[kind]
}

/** Listed objects, bottom of the stack first (Fabric's own order). */
export function getListedLayerObjects(canvas: Canvas): FabricObject[] {
  return canvas.getObjects().filter(isListedLayer)
}

/** Layers as the panel shows them: frontmost first, like every design tool's layer list. */
export function readCanvasLayers(canvas: Canvas): { layers: CanvasLayer[]; objectsById: Map<string, FabricObject> } {
  const selected = new Set<FabricObject>(canvas.getActiveObjects())
  const listed = getListedLayerObjects(canvas)
  const layers: CanvasLayer[] = []
  const objectsById = new Map<string, FabricObject>()

  for (let index = listed.length - 1; index >= 0; index -= 1) {
    const object = listed[index]
    const id = getLayerId(object)
    objectsById.set(id, object)
    layers.push({
      id,
      kind: getLayerKind(object),
      name: getLayerName(object),
      hasCustomName: readCustomName(object) !== null,
      isVisible: object.visible !== false,
      isLocked: isObjectLocked(object),
      isSelected: selected.has(object),
    })
  }

  return { layers, objectsById }
}

export function areLayerListsEqual(a: readonly CanvasLayer[], b: readonly CanvasLayer[]): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index]
    const y = b[index]
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.name !== y.name ||
      x.hasCustomName !== y.hasCustomName ||
      x.isVisible !== y.isVisible ||
      x.isLocked !== y.isLocked ||
      x.isSelected !== y.isSelected
    ) {
      return false
    }
  }
  return true
}

/**
 * Stack index (bottom = 0) that puts `moving` directly above or below `anchor`, in the form
 * Fabric's `moveObjectTo` expects. Null when the move is a no-op or either object is missing.
 */
export function planLayerMoveIndex<T>(
  stack: readonly T[],
  moving: T,
  anchor: T,
  placement: LayerPlacement,
): number | null {
  if (moving === anchor) return null
  const currentIndex = stack.indexOf(moving)
  if (currentIndex < 0) return null
  const rest = stack.filter((item) => item !== moving)
  const anchorIndex = rest.indexOf(anchor)
  if (anchorIndex < 0) return null
  const targetIndex = placement === 'above' ? anchorIndex + 1 : anchorIndex
  return targetIndex === currentIndex ? null : targetIndex
}

/**
 * Selection after a click on row `clickedId`: plain click replaces, Ctrl/Cmd toggles,
 * Shift selects every row between the anchor (last plain/toggle click) and the clicked row.
 */
export function resolveLayerSelection(args: {
  orderedIds: readonly string[]
  selectedIds: readonly string[]
  anchorId: string | null
  clickedId: string
  mode: LayerSelectionMode
}): string[] {
  const { orderedIds, selectedIds, anchorId, clickedId, mode } = args
  if (mode === 'toggle') {
    return selectedIds.includes(clickedId)
      ? selectedIds.filter((id) => id !== clickedId)
      : [...selectedIds, clickedId]
  }
  if (mode === 'range') {
    const clickedIndex = orderedIds.indexOf(clickedId)
    const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1
    if (clickedIndex < 0) return [...selectedIds]
    if (anchorIndex < 0) return [clickedId]
    const [from, to] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex]
    return orderedIds.slice(from, to + 1)
  }
  return [clickedId]
}

/** Programmatic edits don't emit object:modified; history, thumbnails and the toolbar all listen for it. */
function commitLayerChange(canvas: Canvas, object: FabricObject): void {
  canvas.fire('object:modified', { target: object })
  canvas.requestRenderAll()
}

export function moveLayer(
  canvas: Canvas,
  moving: FabricObject,
  anchor: FabricObject,
  placement: LayerPlacement,
): boolean {
  const index = planLayerMoveIndex(canvas.getObjects(), moving, anchor, placement)
  if (index === null) return false
  canvas.moveObjectTo(moving, index)
  commitLayerChange(canvas, moving)
  return true
}

/** One step up/down past the next listed layer, skipping helpers the panel doesn't show. */
export function stepLayer(canvas: Canvas, object: FabricObject, direction: 'up' | 'down'): boolean {
  const listed = getListedLayerObjects(canvas)
  const index = listed.indexOf(object)
  if (index < 0) return false
  const neighbor = direction === 'up' ? listed[index + 1] : listed[index - 1]
  if (!neighbor) return false
  return moveLayer(canvas, object, neighbor, direction === 'up' ? 'above' : 'below')
}

export function setLayerVisible(canvas: Canvas, object: FabricObject, isVisible: boolean): void {
  // A hidden object can't be clicked on the canvas, so it shouldn't stay selected either.
  if (!isVisible && canvas.getActiveObjects().includes(object)) {
    canvas.discardActiveObject()
  }
  object.set('visible', isVisible)
  commitLayerChange(canvas, object)
}

export function setLayerLocked(canvas: Canvas, object: FabricObject, isLocked: boolean): void {
  setObjectLocked(object, isLocked)
  canvas.getActiveObject()?.setCoords()
  commitLayerChange(canvas, object)
}

/** Empty or whitespace names go back to the automatic name. */
export function renameLayer(canvas: Canvas, object: FabricObject, name: string): void {
  const trimmed = name.trim().slice(0, LAYER_NAME_MAX_LENGTH)
  const layer = object as LayerObject
  const current = readCustomName(object)
  if ((current ?? '') === trimmed) return
  if (trimmed) {
    layer.layerName = trimmed
  } else {
    delete layer.layerName
  }
  commitLayerChange(canvas, object)
}

/** Selects the given objects on the canvas; hidden ones are skipped since they can't be edited. */
export function selectLayers(canvas: Canvas, objects: readonly FabricObject[]): void {
  const stack = canvas.getObjects()
  const targets = objects
    .filter((object) => object.visible !== false && object.selectable !== false && stack.includes(object))
    .sort((a, b) => stack.indexOf(a) - stack.indexOf(b))

  if (targets.length === 0) {
    canvas.discardActiveObject()
  } else if (targets.length === 1) {
    canvas.setActiveObject(targets[0])
  } else {
    canvas.discardActiveObject()
    canvas.setActiveObject(new ActiveSelection(targets, { canvas }))
  }
  canvas.requestRenderAll()
}
