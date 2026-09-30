import type { Canvas } from 'fabric'

import { loadPhosphorIconSvg } from '@/utils/phosphor-dynamic-icons'
import { getCanvasPageLogicalSize } from '@/utils/fabric-canvas-pasteboard'
import {
  createFabricIconGroupFromPhosphorSvg,
  PHOSPHOR_ICON_GROUP_TYPE,
} from '@/utils/phosphor-fabric'

type AddPanelIconToCanvasOptions = {
  canvas: Canvas
  iconId: string
  clientX: number
  clientY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export async function addPanelIconToFabricCanvasAtClientPoint(
  options: AddPanelIconToCanvasOptions,
): Promise<void> {
  const { canvas, iconId, clientX, clientY } = options
  const svg = await loadPhosphorIconSvg(iconId)
  if (!svg) return

  const pointer = canvas.getScenePoint({ clientX, clientY } as MouseEvent)
  const { width: baseWidth, height: baseHeight } = getCanvasPageLogicalSize(canvas)

  const group = createFabricIconGroupFromPhosphorSvg(svg)
  group.set('data', {
    source: PHOSPHOR_ICON_GROUP_TYPE,
    iconName: iconId,
    phosphorWeight: 'duotone',
  })
  group.set({
    left: clamp(pointer.x, 0, baseWidth),
    top: clamp(pointer.y, 0, baseHeight),
  })
  group.setCoords()

  canvas.add(group)
  canvas.bringObjectToFront(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}
