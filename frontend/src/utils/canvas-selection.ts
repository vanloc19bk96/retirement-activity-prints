import { ActiveSelection, Group, type Canvas, type FabricObject } from 'fabric'

const registeredCanvases = new Set<Canvas>()

type UngroupableFabricGroup = Group & {
  removeAll: () => FabricObject[]
}

export function isFabricGroup(target: unknown): target is UngroupableFabricGroup {
  return target instanceof Group && !(target instanceof ActiveSelection)
}

export function getActiveSelectionTargets(canvas: Canvas): FabricObject[] {
  const activeObjects = (canvas as any).getActiveObjects?.() as FabricObject[] | undefined
  if (Array.isArray(activeObjects) && activeObjects.length > 0) return activeObjects.filter(Boolean)

  const activeObject = canvas.getActiveObject?.() as FabricObject | null
  return activeObject ? [activeObject] : []
}

export function deleteActiveSelection(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return

  for (const target of targets) {
    canvas.remove(target)
  }

  canvas.discardActiveObject()
  canvas.requestRenderAll()
}

export function groupActiveSelection(canvas: Canvas): void {
  const canvasObjects = canvas.getObjects()
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length < 2) return

  const targetsSet = new Set(targets)
  const topSelectedIndex = Math.max(...targets.map((target) => canvasObjects.indexOf(target)))
  const insertIndex = canvasObjects
    .slice(0, topSelectedIndex + 1)
    .filter((object) => !targetsSet.has(object)).length

  const group = new Group(targets)
  canvas.discardActiveObject()
  canvas.remove(...targets)
  canvas.insertAt(insertIndex, group)
  canvas.setActiveObject(group)
  group.setCoords()
  canvas.requestRenderAll()
}

export function canUngroupActiveSelection(canvas: Canvas): boolean {
  const activeObject = canvas.getActiveObject?.() as unknown
  return isFabricGroup(activeObject) && activeObject.getObjects().length > 0
}

export function ungroupActiveSelection(canvas: Canvas): void {
  const group = canvas.getActiveObject?.() as unknown
  if (!isFabricGroup(group)) return

  const canvasObjects = canvas.getObjects()
  const groupIndex = canvasObjects.indexOf(group)
  if (groupIndex < 0) return

  const objects = group.removeAll()
  if (objects.length === 0) return

  // Lucide/SVG children are created non-interactive so the group stays atomic.
  // Once released onto the canvas they must accept pointer hits again.
  for (const object of objects) {
    object.set({ selectable: true, evented: true })
  }

  canvas.discardActiveObject()
  canvas.remove(group)
  canvas.insertAt(groupIndex, ...objects)

  if (objects.length === 1) {
    canvas.setActiveObject(objects[0])
  } else {
    canvas.setActiveObject(new ActiveSelection(objects, { canvas }))
  }

  for (const object of objects) {
    object.setCoords()
  }
  canvas.requestRenderAll()
}

export function registerCanvasForExclusiveSelection(canvas: Canvas): () => void {
  registeredCanvases.add(canvas)

  return () => {
    registeredCanvases.delete(canvas)
  }
}

export function clearSelectionOnOtherCanvases(activeCanvas: Canvas): void {
  for (const canvas of registeredCanvases) {
    if (canvas === activeCanvas) continue

    try {
      if (getActiveSelectionTargets(canvas).length === 0) continue
      canvas.discardActiveObject()
      canvas.requestRenderAll()
    } catch {
      // Best-effort sync: ignore canvases that are already being disposed.
    }
  }
}
