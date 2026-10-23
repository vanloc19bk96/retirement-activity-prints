import { FabricImage, Rect, Textbox, type Canvas, type FabricObject } from 'fabric'

import { findFontFamilyOption, normalizeFontFamilyForToolbar } from '@/constants/font-families'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import { DPI } from '@/types/canvas-settings.types'
import {
  DEFAULT_SPINE_DESIGN,
  type SpineDesign,
  type SpineRole,
  type SpineTextRole,
} from '@/types/book-cover-spine.types'
import {
  fitCoverImageToPlacementZone,
  resolveCoverPlacementZoneForKind,
} from '@/utils/book-cover-image-placement'
import { computeSpineTextLayout, type SpineTextMeasure } from '@/utils/book-cover-spine-layout'
import { prepareFabricTextMetricsForFontFamily } from '@/utils/canvas-text'
import { fitFabricTextboxWidthToUnwrappedLine } from '@/utils/fabric-textbox-width'
import {
  FABRIC_TEXT_LINE_HEIGHT,
  applyFabricTightTextVerticalMetrics,
} from '@/utils/fabric-text-vertical-metrics'

/** Space kept clear of text at the top and bottom ends of the spine. */
const SPINE_TEXT_END_MARGIN_INCHES = 0.25
const MEASURE_FONT_SIZE = 100
const TEXT_ROLES: SpineTextRole[] = ['title', 'author', 'publisher']

type SpineTaggedObject = FabricObject & {
  spineRole?: SpineRole
  spineDesign?: SpineDesign
  originalImageUrl?: string
}

export interface SpineGeometry {
  zones: BookCoverZones
  dimensions: BookCoverDimensions
}

export function getSpineRole(object: FabricObject): SpineRole | null {
  return (object as SpineTaggedObject).spineRole ?? null
}

export function isSpineObject(object: FabricObject): boolean {
  return getSpineRole(object) != null
}

/** First object per role; extra copies (pasted / duplicated) lose their spine tags. */
function collectSpineObjects(canvas: Canvas): Map<SpineRole, SpineTaggedObject> {
  const byRole = new Map<SpineRole, SpineTaggedObject>()
  for (const object of canvas.getObjects() as SpineTaggedObject[]) {
    const role = object.spineRole
    if (!role) continue
    if (byRole.has(role)) {
      object.set({ spineRole: undefined, spineDesign: undefined } as never)
      continue
    }
    byRole.set(role, object)
  }
  return byRole
}

function canvasFontFamily(fontFamily: string): string {
  return findFontFamilyOption(fontFamily)?.canvasFontFamily ?? fontFamily
}

function textValue(design: SpineDesign, role: SpineTextRole): string {
  return design[role].trim()
}

function fontWeightFor(design: SpineDesign, role: SpineTextRole): number {
  if (role === 'title') return design.titleBold ? 700 : 400
  return role === 'author' ? 500 : 400
}

/**
 * Current spine design, read back from the canvas. Text, font and color come
 * from the objects themselves so edits made directly on the canvas show up in
 * the panel.
 */
export function readSpineDesignFromCanvas(canvas: Canvas): SpineDesign | null {
  const objects = collectSpineObjects(canvas)
  if (objects.size === 0) return null

  const stored = [...objects.values()].find((object) => object.spineDesign)?.spineDesign
  const design: SpineDesign = { ...DEFAULT_SPINE_DESIGN, ...stored }

  const background = objects.get('background')
  const backgroundImage = objects.get('background-image')
  if (backgroundImage) {
    design.backgroundMode = 'image'
    design.backgroundImageUrl = backgroundImage.originalImageUrl ?? design.backgroundImageUrl
  } else if (background) {
    design.backgroundMode = 'color'
    if (typeof background.fill === 'string') design.backgroundColor = background.fill
  } else {
    design.backgroundMode = 'none'
  }

  for (const role of TEXT_ROLES) {
    const textbox = objects.get(role) as (SpineTaggedObject & Textbox) | undefined
    design[role] = textbox?.text ?? ''
  }
  const leadText = (objects.get('title') ?? objects.get('author') ?? objects.get('publisher')) as
    | (SpineTaggedObject & Textbox)
    | undefined
  if (leadText) {
    design.fontFamily = normalizeFontFamilyForToolbar(leadText.fontFamily) ?? design.fontFamily
    if (typeof leadText.fill === 'string') design.textColor = leadText.fill
  }
  const title = objects.get('title') as (SpineTaggedObject & Textbox) | undefined
  if (title) design.titleBold = Number(title.fontWeight) >= 600 || title.fontWeight === 'bold'

  return design
}

function measureTextbox(textbox: Textbox, role: SpineTextRole): SpineTextMeasure {
  textbox.set({ fontSize: MEASURE_FONT_SIZE, scaleX: 1, scaleY: 1 })
  fitFabricTextboxWidthToUnwrappedLine(textbox)
  textbox.initDimensions()
  return { role, widthAt100: textbox.calcTextWidth(), heightAt100: textbox.height }
}

/**
 * Snap every spine object to the current spine zone. Synchronous: fonts and
 * images must already be loaded (they are after a canvas restore).
 */
export function layoutSpineObjects(canvas: Canvas, geometry: SpineGeometry): void {
  const objects = collectSpineObjects(canvas)
  if (objects.size === 0) return
  const { zones, dimensions } = geometry
  const design: SpineDesign = {
    ...DEFAULT_SPINE_DESIGN,
    ...[...objects.values()].find((object) => object.spineDesign)?.spineDesign,
  }

  const background = objects.get('background')
  background?.set({
    left: zones.spine.x,
    top: 0,
    width: zones.spine.width,
    height: dimensions.fullHeightPixels,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
  })
  background?.setCoords()

  const backgroundImage = objects.get('background-image')
  if (backgroundImage) {
    fitCoverImageToPlacementZone(
      backgroundImage as never,
      resolveCoverPlacementZoneForKind('spine', zones, dimensions),
      'spine',
    )
  }

  const textboxes = TEXT_ROLES.flatMap((role) => {
    const textbox = objects.get(role)
    return textbox ? [{ role, textbox: textbox as SpineTaggedObject & Textbox }] : []
  })
  const placements = computeSpineTextLayout({
    safeArea: zones.spineSafeArea,
    endMarginPx: SPINE_TEXT_END_MARGIN_INCHES * DPI,
    items: textboxes.map(({ role, textbox }) => measureTextbox(textbox, role)),
    layout: design.layout,
    direction: design.direction,
    textScale: design.textScale,
  })

  for (const { role, textbox } of textboxes) {
    const placement = placements.find((p) => p.role === role)
    // No room on the spine; the panel blocks text on spines this thin.
    if (!placement) continue
    textbox.set({ fontSize: placement.fontSize })
    fitFabricTextboxWidthToUnwrappedLine(textbox)
    textbox.set({
      originX: 'center',
      originY: 'center',
      left: placement.left,
      top: placement.top,
      angle: placement.angle,
    })
    textbox.setCoords()
  }

  canvas.requestRenderAll()
}

function createBackgroundRect(): Rect {
  return new Rect({
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    // Locked like the Lock action does, so a click on the spine cannot drag it.
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
    selectable: true,
    objectCaching: false,
  })
}

function createSpineTextbox(text: string): Textbox {
  applyFabricTightTextVerticalMetrics()
  return new Textbox(text, {
    originX: 'center',
    originY: 'center',
    textAlign: 'center',
    lineHeight: FABRIC_TEXT_LINE_HEIGHT,
    editable: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    // Spine text only makes sense along the spine; the panel owns its angle.
    lockRotation: true,
    objectCaching: false,
    noScaleCache: true,
  })
}

async function loadBackgroundImage(url: string): Promise<FabricImage | null> {
  try {
    const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    image.set({ originalImageUrl: url } as never)
    return image
  } catch {
    return null
  }
}

/** Raise a newly added spine object above the cover art, keeping text on top. */
function placeNewSpineObject(canvas: Canvas, object: FabricObject, isText: boolean): void {
  canvas.add(object)
  if (isText) return
  const firstText = canvas
    .getObjects()
    .findIndex((candidate) => TEXT_ROLES.includes(getSpineRole(candidate) as SpineTextRole))
  if (firstText >= 0) canvas.moveObjectTo(object, firstText)
}

/**
 * Create, update or remove spine objects so the canvas matches `design`, then
 * lay them out on the current spine.
 */
export async function applySpineDesignToCanvas(
  canvas: Canvas,
  design: SpineDesign,
  geometry: SpineGeometry,
): Promise<void> {
  const objects = collectSpineObjects(canvas)
  const changed: FabricObject[] = []
  const remove = (role: SpineRole): void => {
    const object = objects.get(role)
    if (!object) return
    if (canvas.getActiveObject() === object) canvas.discardActiveObject()
    canvas.remove(object)
    objects.delete(role)
  }

  // Background: one of nothing, a solid rect or a cover-fit image.
  if (design.backgroundMode === 'color') {
    remove('background-image')
    let rect = objects.get('background')
    if (!rect) {
      rect = createBackgroundRect() as SpineTaggedObject
      rect.set({ spineRole: 'background' } as never)
      placeNewSpineObject(canvas, rect, false)
      objects.set('background', rect)
    }
    rect.set({ fill: design.backgroundColor })
    changed.push(rect)
  } else if (design.backgroundMode === 'image' && design.backgroundImageUrl) {
    remove('background')
    const current = objects.get('background-image')
    if (current?.originalImageUrl !== design.backgroundImageUrl) {
      const image = await loadBackgroundImage(design.backgroundImageUrl)
      if (image) {
        remove('background-image')
        image.set({ spineRole: 'background-image' } as never)
        placeNewSpineObject(canvas, image, false)
        objects.set('background-image', image as SpineTaggedObject)
      }
    }
  } else {
    remove('background')
    remove('background-image')
  }

  // Text: one textbox per non-empty role.
  const hasAnyText = TEXT_ROLES.some((role) => textValue(design, role).length > 0)
  if (hasAnyText) await prepareFabricTextMetricsForFontFamily(design.fontFamily)
  for (const role of TEXT_ROLES) {
    const text = textValue(design, role)
    if (!text) {
      remove(role)
      continue
    }
    let textbox = objects.get(role) as (SpineTaggedObject & Textbox) | undefined
    if (!textbox) {
      textbox = createSpineTextbox(text) as SpineTaggedObject & Textbox
      textbox.set({ spineRole: role } as never)
      placeNewSpineObject(canvas, textbox, true)
      objects.set(role, textbox)
    }
    textbox.set({
      text,
      fontFamily: canvasFontFamily(design.fontFamily),
      fontWeight: fontWeightFor(design, role),
      fill: design.textColor,
      styles: {},
    })
    changed.push(textbox)
  }

  for (const object of objects.values()) {
    object.set({ spineDesign: { ...design } } as never)
  }

  layoutSpineObjects(canvas, geometry)
  // Lets save tracking and thumbnails notice in-place property changes.
  for (const object of changed) canvas.fire('object:modified', { target: object } as never)
}

export function removeSpineDesignFromCanvas(canvas: Canvas): void {
  const objects = collectSpineObjects(canvas)
  if (objects.size === 0) return
  canvas.discardActiveObject()
  canvas.remove(...objects.values())
  canvas.requestRenderAll()
}
