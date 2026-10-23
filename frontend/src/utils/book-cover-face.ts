import { FabricImage, Point, Rect, Shadow, Textbox, type Canvas, type FabricObject } from 'fabric'

import { findFontFamilyOption, normalizeFontFamilyForToolbar } from '@/constants/font-families'
import type { ZoneRect } from '@/types/book-cover.types'
import { DPI } from '@/types/canvas-settings.types'
import {
  COVER_FACE_TEXT_ROLES,
  DEFAULT_COVER_FACE_DESIGNS,
  type CoverFace,
  type CoverFaceDesign,
  type CoverFaceRole,
  type CoverFaceTag,
  type CoverFaceTextRole,
} from '@/types/book-cover-face.types'
import {
  fitCoverImageToPlacementZone,
  resolveCoverPlacementZoneForKind,
} from '@/utils/book-cover-image-placement'
import {
  computeCoverFaceTextLayout,
  coverFaceAnchorX,
  coverFaceLeadFontSize,
  coverFaceRelativeFontSize,
  type CoverFaceTextMeasure,
} from '@/utils/book-cover-face-layout'
import type { SpineGeometry } from '@/utils/book-cover-spine'
import { prepareFabricTextMetricsForFontFamily } from '@/utils/canvas-text'
import { applyFabricTightTextVerticalMetrics } from '@/utils/fabric-text-vertical-metrics'

/** Text keeps this far inside the cover safe area (and away from the spine fold). */
const TEXT_INSET_INCHES = 0.25
/** Back cover text stops this far above the KDP barcode box. */
const BARCODE_CLEARANCE_INCHES = 0.15
/** A text box moved more than this (scene px) counts as placed by the user. */
const MOVE_TOLERANCE_PX = 1
const MAX_FIT_ATTEMPTS = 8
const FACES: CoverFace[] = ['front', 'back']

const LINE_HEIGHT: Record<CoverFaceTextRole, number> = {
  title: 1.08,
  subtitle: 1.15,
  author: 1.15,
  headline: 1.12,
  description: 1.35,
}

export type CoverFaceGeometry = SpineGeometry

type CoverFaceTaggedObject = FabricObject & {
  coverFace?: CoverFaceTag
  coverFaceDesign?: CoverFaceDesign
  originalImageUrl?: string
}

type CoverFaceTextbox = CoverFaceTaggedObject & Textbox

export function getCoverFaceTag(object: FabricObject): CoverFaceTag | null {
  return (object as CoverFaceTaggedObject).coverFace ?? null
}

export function isCoverFaceObject(object: FabricObject, face?: CoverFace): boolean {
  const tag = getCoverFaceTag(object)
  return tag != null && (face == null || tag.face === face)
}

function isTextRole(role: CoverFaceRole): role is CoverFaceTextRole {
  return role !== 'background' && role !== 'background-image'
}

/** First object per role; extra copies (pasted / duplicated) lose their cover tags. */
function collectCoverFaceObjects(canvas: Canvas, face: CoverFace): Map<CoverFaceRole, CoverFaceTaggedObject> {
  const byRole = new Map<CoverFaceRole, CoverFaceTaggedObject>()
  for (const object of canvas.getObjects() as CoverFaceTaggedObject[]) {
    const tag = object.coverFace
    if (!tag || tag.face !== face) continue
    if (byRole.has(tag.role)) {
      object.set({ coverFace: undefined, coverFaceDesign: undefined } as never)
      continue
    }
    byRole.set(tag.role, object)
  }
  return byRole
}

function storedDesign(face: CoverFace, objects: Map<CoverFaceRole, CoverFaceTaggedObject>): CoverFaceDesign {
  return {
    ...DEFAULT_COVER_FACE_DESIGNS[face],
    ...[...objects.values()].find((object) => object.coverFaceDesign)?.coverFaceDesign,
  }
}

/** Area the panel lays text out in: the safe area, inset, and above the barcode on the back. */
export function resolveCoverFaceTextArea(face: CoverFace, geometry: CoverFaceGeometry): ZoneRect {
  const { zones } = geometry
  const safe = face === 'front' ? zones.frontSafeArea : zones.backSafeArea
  const inset = TEXT_INSET_INCHES * DPI
  const top = safe.y + inset
  let bottom = safe.y + safe.height - inset
  if (face === 'back') {
    bottom = Math.min(bottom, zones.barcodeArea.y - BARCODE_CLEARANCE_INCHES * DPI)
  }
  return {
    x: safe.x + inset,
    y: top,
    width: Math.max(0, safe.width - inset * 2),
    height: Math.max(0, bottom - top),
  }
}

function canvasFontFamily(fontFamily: string): string {
  return findFontFamilyOption(fontFamily)?.canvasFontFamily ?? fontFamily
}

function isLeadRole(role: CoverFaceTextRole): boolean {
  return role === 'title' || role === 'headline'
}

function fontFamilyFor(design: CoverFaceDesign, role: CoverFaceTextRole): string {
  return canvasFontFamily(isLeadRole(role) ? design.titleFontFamily : design.bodyFontFamily)
}

function fontWeightFor(design: CoverFaceDesign, role: CoverFaceTextRole): number {
  if (isLeadRole(role)) return design.titleBold ? 700 : 400
  return role === 'author' ? 500 : 400
}

function textShadowFor(design: CoverFaceDesign, fontSize: number): Shadow | null {
  if (!design.textShadow) return null
  return new Shadow({
    color: 'rgba(0,0,0,0.45)',
    blur: Math.max(2, fontSize * 0.12),
    offsetX: 0,
    offsetY: Math.max(1, fontSize * 0.04),
  })
}

function isBold(textbox: Textbox): boolean {
  return Number(textbox.fontWeight) >= 600 || textbox.fontWeight === 'bold'
}

/**
 * Current design of one face, read back from the canvas. Text, fonts and color
 * come from the objects so edits made directly on the canvas show in the panel.
 */
export function readCoverFaceDesignFromCanvas(canvas: Canvas, face: CoverFace): CoverFaceDesign | null {
  const objects = collectCoverFaceObjects(canvas, face)
  if (objects.size === 0) return null
  const design = storedDesign(face, objects)

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

  const roles = COVER_FACE_TEXT_ROLES[face]
  for (const role of roles) {
    design[role] = (objects.get(role) as CoverFaceTextbox | undefined)?.text ?? ''
  }
  const textboxes = roles.flatMap((role) => {
    const textbox = objects.get(role) as CoverFaceTextbox | undefined
    return textbox ? [{ role, textbox }] : []
  })
  const lead = textboxes.find(({ role }) => isLeadRole(role))?.textbox
  const body = textboxes.find(({ role }) => !isLeadRole(role))?.textbox
  if (lead) {
    design.titleFontFamily = normalizeFontFamilyForToolbar(lead.fontFamily) ?? design.titleFontFamily
    design.titleBold = isBold(lead)
  }
  if (body) design.bodyFontFamily = normalizeFontFamilyForToolbar(body.fontFamily) ?? design.bodyFontFamily
  const colorSource = lead ?? body
  if (colorSource && typeof colorSource.fill === 'string') design.textColor = colorSource.fill

  return design
}

/** Turn a drag the user made since the last layout into a manual spot (share of the text area). */
function captureManualPosition(object: CoverFaceTaggedObject): void {
  const tag = object.coverFace
  if (!tag || !isTextRole(tag.role) || !tag.zone || tag.placedLeft == null || tag.placedTop == null) return
  const moved =
    Math.abs((object.left ?? 0) - tag.placedLeft) > MOVE_TOLERANCE_PX ||
    Math.abs((object.top ?? 0) - tag.placedTop) > MOVE_TOLERANCE_PX
  if (!moved || tag.zone.width <= 0 || tag.zone.height <= 0) return
  const center = object.getCenterPoint()
  object.set({
    coverFace: {
      ...tag,
      manual: {
        fx: (center.x - tag.zone.x) / tag.zone.width,
        fy: (center.y - tag.zone.y) / tag.zone.height,
      },
    },
  } as never)
}

/**
 * Record text the user dragged on the canvas. The cover resize path calls this
 * before rescaling objects, since a rescale moves everything.
 */
export function captureCoverFaceManualPositions(canvas: Canvas): void {
  for (const object of canvas.getObjects() as CoverFaceTaggedObject[]) {
    if (object.coverFace) captureManualPosition(object)
  }
}

function layoutFace(
  canvas: Canvas,
  face: CoverFace,
  geometry: CoverFaceGeometry,
  options: { detectManualMoves: boolean; resetPositions: boolean },
): void {
  const objects = collectCoverFaceObjects(canvas, face)
  if (objects.size === 0) return
  const design = storedDesign(face, objects)
  const zone = resolveCoverPlacementZoneForKind(face, geometry.zones, geometry.dimensions)

  const background = objects.get('background')
  background?.set({
    left: zone.x,
    top: zone.y,
    width: zone.width,
    height: zone.height,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
  })
  background?.setCoords()

  const backgroundImage = objects.get('background-image')
  if (backgroundImage) fitCoverImageToPlacementZone(backgroundImage as never, zone, face)

  const area = resolveCoverFaceTextArea(face, geometry)
  const textboxes = COVER_FACE_TEXT_ROLES[face].flatMap((role) => {
    const textbox = objects.get(role) as CoverFaceTextbox | undefined
    return textbox ? [{ role, textbox }] : []
  })
  if (textboxes.length > 0 && area.width > 0 && area.height > 0) {
    if (options.detectManualMoves) for (const { textbox } of textboxes) captureManualPosition(textbox)

    // Largest size up to the chosen scale where every line fits the area.
    const baseLead = coverFaceLeadFontSize(face, area) * design.textScale
    const wordShrink = new Map<CoverFaceTextRole, number>()
    let fit = 1
    let placements: ReturnType<typeof computeCoverFaceTextLayout>['placements'] = []
    for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt += 1) {
      const lead = baseLead * fit
      const measures: CoverFaceTextMeasure[] = textboxes.map(({ role, textbox }) => {
        const sizeFor = (): number => lead * coverFaceRelativeFontSize(face, role) * (wordShrink.get(role) ?? 1)
        textbox.set({ fontSize: sizeFor(), width: area.width, scaleX: 1, scaleY: 1, angle: 0 })
        textbox.initDimensions()
        // Fabric widens the box to the longest word; shrink that line instead.
        if (textbox.width > area.width + MOVE_TOLERANCE_PX) {
          wordShrink.set(role, (wordShrink.get(role) ?? 1) * (area.width / textbox.width) * 0.98)
          textbox.set({ fontSize: sizeFor(), width: area.width })
          textbox.initDimensions()
        }
        return { role, height: textbox.height }
      })
      const result = computeCoverFaceTextLayout({
        face,
        area,
        items: measures,
        arrangement: design.arrangement,
        leadFontSize: lead,
      })
      placements = result.placements
      if (result.requiredHeight <= area.height) break
      fit *= Math.max(0.5, area.height / result.requiredHeight) * 0.98
    }

    const anchorX = coverFaceAnchorX(area, design.textAlign)
    for (const { role, textbox } of textboxes) {
      const tag = textbox.coverFace!
      const placement = placements.find((p) => p.role === role)
      textbox.set({
        textAlign: design.textAlign,
        originX: design.textAlign,
        originY: 'top',
        shadow: textShadowFor(design, textbox.fontSize),
      })
      const manual = options.resetPositions ? null : tag.manual
      if (manual) {
        textbox.setPositionByOrigin(
          new Point(area.x + manual.fx * area.width, area.y + manual.fy * area.height),
          'center',
          'center',
        )
      } else {
        textbox.set({ left: anchorX, top: placement?.top ?? area.y })
      }
      textbox.setCoords()
      textbox.set({
        coverFace: {
          ...tag,
          zone: { ...area },
          placedLeft: textbox.left,
          placedTop: textbox.top,
          manual: manual ?? null,
        },
      } as never)
    }
  }

  canvas.requestRenderAll()
}

/**
 * Snap the managed front / back objects to the current cover zones.
 * Synchronous: fonts and images must already be loaded (they are after a restore).
 */
export function layoutCoverFaceObjects(
  canvas: Canvas,
  geometry: CoverFaceGeometry,
  options: { face?: CoverFace; detectManualMoves?: boolean; resetPositions?: boolean } = {},
): void {
  for (const face of options.face ? [options.face] : FACES) {
    layoutFace(canvas, face, geometry, {
      detectManualMoves: options.detectManualMoves ?? true,
      resetPositions: options.resetPositions ?? false,
    })
  }
}

function createBackgroundRect(): Rect {
  return new Rect({
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    // Locked so a click on the cover cannot drag the background around.
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

function createFaceTextbox(text: string): Textbox {
  applyFabricTightTextVerticalMetrics()
  return new Textbox(text, {
    originX: 'center',
    originY: 'top',
    editable: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    objectCaching: false,
    noScaleCache: true,
  })
}

async function loadBackgroundImage(url: string): Promise<FabricImage | null> {
  try {
    const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    image.set({
      originalImageUrl: url,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
    } as never)
    return image
  } catch {
    return null
  }
}

/**
 * Create, update or remove one face's objects so the canvas matches `design`,
 * then lay them out on the current cover.
 */
export async function applyCoverFaceDesignToCanvas(
  canvas: Canvas,
  face: CoverFace,
  design: CoverFaceDesign,
  geometry: CoverFaceGeometry,
  options: { resetPositions?: boolean } = {},
): Promise<void> {
  const objects = collectCoverFaceObjects(canvas, face)
  const changed: FabricObject[] = []
  const tagFor = (role: CoverFaceRole): CoverFaceTag => ({ face, role })
  const remove = (role: CoverFaceRole): void => {
    const object = objects.get(role)
    if (!object) return
    if (canvas.getActiveObject() === object) canvas.discardActiveObject()
    canvas.remove(object)
    objects.delete(role)
  }
  // Backgrounds sit under everything, so the user's own art stays on top.
  const addBackground = (object: CoverFaceTaggedObject): void => {
    canvas.add(object)
    canvas.moveObjectTo(object, 0)
  }

  if (design.backgroundMode === 'color') {
    remove('background-image')
    let rect = objects.get('background')
    if (!rect) {
      rect = createBackgroundRect() as CoverFaceTaggedObject
      rect.set({ coverFace: tagFor('background') } as never)
      addBackground(rect)
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
        image.set({ coverFace: tagFor('background-image') } as never)
        addBackground(image as CoverFaceTaggedObject)
        objects.set('background-image', image as CoverFaceTaggedObject)
      }
    }
  } else {
    remove('background')
    remove('background-image')
  }

  const roles = COVER_FACE_TEXT_ROLES[face]
  const texts = roles.map((role) => ({ role, text: design[role].trim() }))
  if (texts.some(({ text }) => text.length > 0)) {
    await Promise.all(
      [...new Set([design.titleFontFamily, design.bodyFontFamily])].map((family) =>
        prepareFabricTextMetricsForFontFamily(family),
      ),
    )
  }
  for (const { role, text } of texts) {
    if (!text) {
      remove(role)
      continue
    }
    let textbox = objects.get(role) as CoverFaceTextbox | undefined
    if (!textbox) {
      textbox = createFaceTextbox(text) as CoverFaceTextbox
      textbox.set({ coverFace: tagFor(role) } as never)
      canvas.add(textbox)
      objects.set(role, textbox)
    }
    textbox.set({
      // Inner line breaks stay: descriptions are paragraphs.
      text,
      fontFamily: fontFamilyFor(design, role),
      fontWeight: fontWeightFor(design, role),
      fill: design.textColor,
      lineHeight: LINE_HEIGHT[role],
      styles: {},
    })
    changed.push(textbox)
  }

  for (const object of objects.values()) {
    object.set({ coverFaceDesign: { ...design } } as never)
  }

  layoutCoverFaceObjects(canvas, geometry, { face, resetPositions: options.resetPositions })
  // Lets save tracking and thumbnails notice in-place property changes.
  for (const object of changed) canvas.fire('object:modified', { target: object } as never)
}

export function removeCoverFaceDesignFromCanvas(canvas: Canvas, face: CoverFace): void {
  const objects = collectCoverFaceObjects(canvas, face)
  if (objects.size === 0) return
  canvas.discardActiveObject()
  canvas.remove(...objects.values())
  canvas.requestRenderAll()
}

/** True when the user has dragged any of this face's text away from its automatic spot. */
export function hasManualCoverFacePositions(canvas: Canvas, face: CoverFace): boolean {
  for (const object of collectCoverFaceObjects(canvas, face).values()) {
    captureManualPosition(object)
    if (object.coverFace?.manual) return true
  }
  return false
}
