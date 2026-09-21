import type { Canvas } from 'fabric'

import { loadSvgAsFabricObject } from '@/utils/canvas-svg'

type AddEmojiToCanvasOptions = {
  canvas: Canvas
  src: string
  clientX: number
  clientY: number
}

/** Target on-canvas width in abstract (unzoomed) canvas units. */
const EMOJI_TARGET_WIDTH = 96
export const EMOJI_GROUP_SOURCE = 'emoji-svg'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * SVG emojis often declare only a `viewBox` (no intrinsic width/height), so loading
 * them as a raster `FabricImage` yields a zero-sized image — visible bounding box but
 * no pixels. Parsing the SVG into vector objects renders reliably and stays crisp.
 */
export async function addEmojiToFabricCanvasAtClientPoint(
  options: AddEmojiToCanvasOptions,
): Promise<void> {
  const { canvas, src, clientX, clientY } = options

  const emoji = await loadSvgAsFabricObject(src)
  if (!emoji) return

  const pointer = canvas.getScenePoint({ clientX, clientY } as MouseEvent)
  const zoom = canvas.getZoom()
  const baseWidth = canvas.getWidth() / zoom
  const baseHeight = canvas.getHeight() / zoom

  emoji.set({
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
  })
  ;(emoji as unknown as { set: (key: string, value: unknown) => void }).set('data', {
    source: EMOJI_GROUP_SOURCE,
    originalImageUrl: src,
  })

  emoji.scaleToWidth(EMOJI_TARGET_WIDTH)
  emoji.set({
    left: clamp(pointer.x, 0, baseWidth),
    top: clamp(pointer.y, 0, baseHeight),
  })
  emoji.setCoords()

  canvas.add(emoji)
  canvas.bringObjectToFront(emoji)
  canvas.setActiveObject(emoji)
  canvas.requestRenderAll()
}
