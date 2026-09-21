import type { Canvas, FabricObject } from 'fabric'

/** Scene-space guide lines to draw after objects render (viewport applied when drawing). */
export type FabricAlignmentGuideState = {
  horizontalYs: number[]
  verticalXs: number[]
}

type AlignmentComputation = {
  dx: number
  dy: number
  horizontalYs: number[]
  verticalXs: number[]
}

const ANCHOR_FRACTIONS = [0, 0.5, 1] as const

function readLockMovementX(target: FabricObject): boolean {
  return Boolean((target as FabricObject & { lockMovementX?: boolean }).lockMovementX)
}

function readLockMovementY(target: FabricObject): boolean {
  return Boolean((target as FabricObject & { lockMovementY?: boolean }).lockMovementY)
}

function collectObstacleObjects(canvas: Canvas, moving: FabricObject): FabricObject[] {
  return canvas.getObjects().filter((o) => {
    if (o === moving) return false
    if (o.visible === false) return false
    return true
  })
}

function bboxAnchorsX(box: { left: number; width: number }): [number, number, number] {
  return [
    box.left + box.width * ANCHOR_FRACTIONS[0],
    box.left + box.width * ANCHOR_FRACTIONS[1],
    box.left + box.width * ANCHOR_FRACTIONS[2],
  ]
}

function bboxAnchorsY(box: { top: number; height: number }): [number, number, number] {
  return [
    box.top + box.height * ANCHOR_FRACTIONS[0],
    box.top + box.height * ANCHOR_FRACTIONS[1],
    box.top + box.height * ANCHOR_FRACTIONS[2],
  ]
}

/**
 * Compare AABB of `moving` to peers; find magnetic deltas and guide line positions.
 * Snap deltas are meant for **translation** (drag) only — do not apply during scale/resize,
 * or they fight Fabric’s fixed-anchor scaling math.
 */
export function computeFabricAlignmentDeltasAndGuides(
  canvas: Canvas,
  moving: FabricObject,
  thresholdScene: number,
): AlignmentComputation {
  moving.setCoords()
  const moveBox = moving.getBoundingRect()
  const myX = bboxAnchorsX(moveBox)
  const myY = bboxAnchorsY(moveBox)

  const others = collectObstacleObjects(canvas, moving)

  let bestDx: number | null = null
  let bestDxAbs = Infinity
  const verticalXs: number[] = []

  let bestDy: number | null = null
  let bestDyAbs = Infinity
  const horizontalYs: number[] = []

  for (const o of others) {
    const ob = o.getBoundingRect()
    const ox = bboxAnchorsX(ob)
    const oy = bboxAnchorsY(ob)

    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const d = ox[j] - myX[i]
        const ad = Math.abs(d)
        if (ad > thresholdScene) continue
        if (ad < bestDxAbs - 1e-9) {
          bestDx = d
          bestDxAbs = ad
          verticalXs.length = 0
          verticalXs.push(ox[j])
        } else if (bestDx != null && Math.abs(ad - bestDxAbs) < 1e-9 && Math.abs(d - bestDx) < 1e-9) {
          if (!verticalXs.includes(ox[j])) verticalXs.push(ox[j])
        }
      }
    }

    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const d = oy[j] - myY[i]
        const ad = Math.abs(d)
        if (ad > thresholdScene) continue
        if (ad < bestDyAbs - 1e-9) {
          bestDy = d
          bestDyAbs = ad
          horizontalYs.length = 0
          horizontalYs.push(oy[j])
        } else if (bestDy != null && Math.abs(ad - bestDyAbs) < 1e-9 && Math.abs(d - bestDy) < 1e-9) {
          if (!horizontalYs.includes(oy[j])) horizontalYs.push(oy[j])
        }
      }
    }
  }

  const lockX = readLockMovementX(moving)
  const lockY = readLockMovementY(moving)

  const dx = !lockX && bestDx != null ? bestDx : 0
  const dy = !lockY && bestDy != null ? bestDy : 0

  return { dx, dy, horizontalYs, verticalXs }
}

function toGuideState(computed: AlignmentComputation): FabricAlignmentGuideState | null {
  const hasGuides = computed.horizontalYs.length > 0 || computed.verticalXs.length > 0
  if (!hasGuides) return null
  return { horizontalYs: computed.horizontalYs, verticalXs: computed.verticalXs }
}

/**
 * Snap by translating `left`/`top` (for drag). Returns guide state when peers align within threshold.
 */
export function applyFabricAlignmentSnapAndGuides(
  canvas: Canvas,
  moving: FabricObject,
  options: { thresholdPx: number; zoom: number },
): FabricAlignmentGuideState | null {
  const thresholdScene = options.thresholdPx / options.zoom
  const computed = computeFabricAlignmentDeltasAndGuides(canvas, moving, thresholdScene)

  if (computed.dx !== 0 || computed.dy !== 0) {
    moving.set({
      left: (moving.left ?? 0) + computed.dx,
      top: (moving.top ?? 0) + computed.dy,
    })
    moving.setCoords()
  }

  return toGuideState(computed)
}

/**
 * Alignment guides while scaling/resizing — **visual only**. Same proximity rules as drag snap.
 * Do not apply `dx`/`dy` here: Fabric keeps a fixed anchor during scale; translation snaps fight that.
 */
export function getFabricAlignmentGuidesOnly(
  canvas: Canvas,
  target: FabricObject,
  options: { thresholdPx: number; zoom: number },
): FabricAlignmentGuideState | null {
  const thresholdScene = options.thresholdPx / options.zoom
  const computed = computeFabricAlignmentDeltasAndGuides(canvas, target, thresholdScene)
  return toGuideState(computed)
}

/**
 * Draw alignment guides in canvas space (call from `after:render` with lower-canvas `ctx`).
 */
export function drawFabricAlignmentGuides(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  state: FabricAlignmentGuideState,
): void {
  const vpt = canvas.viewportTransform
  if (!vpt) return

  const z = vpt[0] || 1
  ctx.save()
  ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
  ctx.strokeStyle = 'rgba(236, 72, 153, 0.92)'
  ctx.lineWidth = Math.max(1 / z, 0.75)
  ctx.setLineDash([])

  const sceneW = canvas.getWidth() / z
  const sceneH = canvas.getHeight() / vpt[3] || z

  const extend = 8000
  for (const y of state.horizontalYs) {
    ctx.beginPath()
    ctx.moveTo(-extend, y)
    ctx.lineTo(sceneW + extend, y)
    ctx.stroke()
  }
  for (const x of state.verticalXs) {
    ctx.beginPath()
    ctx.moveTo(x, -extend)
    ctx.lineTo(x, sceneH + extend)
    ctx.stroke()
  }
  ctx.restore()
}
