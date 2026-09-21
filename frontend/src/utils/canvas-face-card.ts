import type { Canvas, FabricObject } from 'fabric'
import { FabricImage, Group, Textbox } from 'fabric'

import {
  STUDIO_BODY_SIZE,
  STUDIO_DEFAULT_FONT,
  STUDIO_INK,
} from '@/constants/studio.constants'
import { prepareFabricTextMetricsForFontFamily } from '@/utils/canvas-text'
import type { FaceMixEntry } from '@/utils/studio/face-name-recall/face-specs'
import { renderFaceMixSvg } from '@/utils/studio/face-name-recall/face-preview'
import { rasterizeSvgToPngDataUri } from '@/utils/studio/face-name-recall/rasterize'

type AddFaceCardToCanvasOptions = {
  canvas: Canvas
  entry: FaceMixEntry
  clientX: number
  clientY: number
}

/** On-canvas face width in abstract (unzoomed) canvas units. */
const FACE_TARGET_WIDTH = 220
/** Matches worksheet `FACE_NAME_GAP` in face-name-recall/generate.ts. */
const FACE_NAME_GAP = 12

export const FACE_CARD_GROUP_SOURCE = 'studio-face-card'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Drop a hand-mixed face onto a page. The face is rasterised first: the Open
 * Peeps artwork continues well past its frame (arms, hands, torso), and Fabric's
 * SVG import keeps everything outside the viewBox — a PNG carries the same
 * head-and-shoulders crop the printed page uses. A typed name rides along as
 * one group so face and name move, scale and delete together.
 *
 * Fabric 7 defaults origin to center — pin left/top so the name gap matches
 * worksheet cards (name sits FACE_NAME_GAP below the image bottom edge).
 */
export async function addFaceCardToFabricCanvasAtClientPoint(
  options: AddFaceCardToCanvasOptions,
): Promise<void> {
  const { canvas, entry, clientX, clientY } = options

  const { dataUri } = await rasterizeSvgToPngDataUri(renderFaceMixSvg(entry))
  const image = await FabricImage.fromURL(dataUri)
  const imageWidth = image.width || FACE_TARGET_WIDTH
  const scale = FACE_TARGET_WIDTH / imageWidth
  image.set({
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    scaleX: scale,
    scaleY: scale,
  })

  const children: FabricObject[] = [image]
  const name = entry.name.trim()
  if (name) {
    await prepareFabricTextMetricsForFontFamily(STUDIO_DEFAULT_FONT)
    children.push(
      new Textbox(name, {
        originX: 'left',
        originY: 'top',
        left: 0,
        top: image.getScaledHeight() + FACE_NAME_GAP,
        width: FACE_TARGET_WIDTH,
        fontFamily: STUDIO_DEFAULT_FONT,
        fontSize: STUDIO_BODY_SIZE,
        lineHeight: 1,
        textAlign: 'center',
        fill: STUDIO_INK,
        editable: true,
        objectCaching: false,
        noScaleCache: true,
      }),
    )
  }

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
    source: FACE_CARD_GROUP_SOURCE,
    faceMixId: entry.id,
  })

  const pointer = canvas.getScenePoint({ clientX, clientY } as MouseEvent)
  const zoom = canvas.getZoom()
  group.set({
    left: clamp(pointer.x, 0, canvas.getWidth() / zoom),
    top: clamp(pointer.y, 0, canvas.getHeight() / zoom),
  })
  group.setCoords()

  canvas.add(group)
  canvas.bringObjectToFront(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
}
