import {
  Circle,
  Ellipse,
  FabricImage,
  Group,
  Line,
  Path,
  Point,
  Polygon,
  Polyline,
  Rect,
  Text,
  Textbox,
  Triangle,
  util,
  type FabricObject,
} from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { stripPerCharacterFontFamilyFromFabricText } from '@/utils/canvas-text'
import {
  addFabricRasterToSlide,
  getFabricNativeShapeBox,
  getFabricObjectBox,
  resolveFabricRectRadiusInches,
} from '@/utils/fabric-ppt-raster'
import {
  ensureFontsReadyForPptRaster,
  resolvePptNativeFontFace,
  shouldRasterizeFabricTextForPpt,
} from '@/utils/fabric-ppt-text-font'
import {
  expandPptTextBoxForFabricText,
  fabricOpacityToTransparency,
  isBoldFontWeight,
  isFabricTextSingleVisualLine,
  parseFabricColor,
  pixelsToInches,
  pixelsToPoints,
  resolveFabricTextVisualFontSizePx,
  resolveFabricVisualStrokeWidthPx,
  resolvePptTextAlignFromFabricText,
} from '@/utils/fabric-ppt-units'

const EDITABLE_TEXT_OBJECT_TYPES = new Set(['textbox', 'i-text', 'text'])

type PptSlide = PptxGenJS.Slide
type PptDashType = NonNullable<PptxGenJS.ShapeLineProps['dashType']>

/** Map Fabric dash pattern → pptxgenjs preset (custom arrays are not supported). */
function resolvePptDashType(object: FabricObject): PptDashType | undefined {
  const dash = (object as { strokeDashArray?: number[] | null }).strokeDashArray
  if (!Array.isArray(dash) || dash.length === 0) return undefined

  const on = dash[0] ?? 0
  const off = dash[1] ?? on
  if (on <= 0) return undefined
  // Short marks read as dots in editor (e.g. [1, 3], [2, 2]).
  if (on <= 2 && off >= on) return 'sysDot'
  if (on >= 12) return 'lgDash'
  return 'dash'
}

function buildShapeLineOptions(object: FabricObject): PptxGenJS.ShapeLineProps {
  const visualStrokeWidthPx = resolveFabricVisualStrokeWidthPx(object)
  const strokeColor = parseFabricColor((object as { stroke?: unknown }).stroke)
  // strokeWidth 0 must not fall back to 1pt — that outlines hairline fill bars
  // (cryptogram rules) and closes the gap to the letters.
  if (visualStrokeWidthPx <= 0 || !strokeColor) return { type: 'none' }

  const dashType = resolvePptDashType(object)
  return {
    color: strokeColor,
    width: pixelsToPoints(visualStrokeWidthPx),
    ...(dashType ? { dashType } : {}),
  }
}

function buildShapeFillOptions(object: FabricObject): PptxGenJS.ShapeFillProps | undefined {
  const fillColor = parseFabricColor((object as { fill?: unknown }).fill)
  const transparency = fabricOpacityToTransparency(object.opacity)

  if (!fillColor) {
    return { type: 'none' }
  }

  return transparency !== undefined ? { color: fillColor, transparency } : { color: fillColor }
}

function resolvePptUnderline(
  object: Text | Textbox,
  color: string,
): { style: 'sng'; color: string } | undefined {
  if (!object.underline) return undefined
  return { style: 'sng', color }
}

function addFabricTextToSlide(slide: PptSlide, object: Text | Textbox): void {
  const textValue = object.text ?? ''
  if (!textValue.trim()) return

  const box = getFabricObjectBox(object)
  const pptAlign = resolvePptTextAlignFromFabricText(object)
  const fillColor = parseFabricColor(object.fill) ?? '111111'
  const transparency = fabricOpacityToTransparency(object.opacity)
  const underline = resolvePptUnderline(object, fillColor)

  const commonOptions = {
    fontFace: resolvePptNativeFontFace(object.fontFamily),
    fontSize: pixelsToPoints(resolveFabricTextVisualFontSizePx(object)),
    color: fillColor,
    bold: isBoldFontWeight(object.fontWeight),
    italic: object.fontStyle === 'italic',
    align: pptAlign,
    rotate: box.rotate,
    transparency,
    ...(underline ? { underline } : {}),
  }

  // Soft-wrapped Textboxes keep the Fabric box and let PPT reflow (margin 0 so
  // insets do not change break points). Single-line Textboxes / i-text / text
  // expand width — PPT bold metrics are wider than Fabric and would otherwise
  // wrap labels like “Game 1” onto a second line over the instruction.
  const shouldKeepFixedWrapBox =
    object instanceof Textbox && !isFabricTextSingleVisualLine(object)

  if (shouldKeepFixedWrapBox) {
    slide.addText(textValue, {
      ...commonOptions,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      valign: 'top',
      wrap: true,
      margin: 0,
    })
    return
  }

  const textBox = expandPptTextBoxForFabricText({
    box,
    object,
    pixelBounds: object.getBoundingRect(),
  })

  slide.addText(textValue, {
    ...commonOptions,
    x: textBox.x,
    y: textBox.y,
    w: textBox.w,
    h: textBox.h,
    valign: 'middle',
    wrap: false,
    margin: 0,
  })
}

function addNativeShapeToSlide(
  slide: PptSlide,
  object: FabricObject,
  shapeName: 'rect' | 'roundRect' | 'ellipse' | 'triangle',
  extra?: { rectRadius?: number },
): void {
  const box = getFabricNativeShapeBox(object)
  slide.addShape(shapeName, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: buildShapeFillOptions(object),
    line: buildShapeLineOptions(object),
    rotate: box.rotate,
    flipH: box.flipH,
    flipV: box.flipV,
    ...extra,
  })
}

function addFabricRectToSlide(slide: PptSlide, object: Rect): void {
  const rectRadius = resolveFabricRectRadiusInches(object)
  if (rectRadius !== undefined) {
    addNativeShapeToSlide(slide, object, 'roundRect', { rectRadius })
    return
  }
  addNativeShapeToSlide(slide, object, 'rect')
}

function addFabricEllipseToSlide(slide: PptSlide, object: Circle | Ellipse): void {
  addNativeShapeToSlide(slide, object, 'ellipse')
}

/** Canvas-space endpoints after object/group transforms (not stroke-inflated AABB). */
function getFabricLineCanvasEndpoints(object: Line): { x1: number; y1: number; x2: number; y2: number } {
  const local = object.calcLinePoints()
  const matrix = object.calcTransformMatrix()
  const start = util.transformPoint(new Point(local.x1, local.y1), matrix)
  const end = util.transformPoint(new Point(local.x2, local.y2), matrix)
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function addFabricLineToSlide(slide: PptSlide, object: Line): void {
  const lineColor = parseFabricColor(object.stroke) ?? '111111'
  const visualStrokeWidthPx = resolveFabricVisualStrokeWidthPx(object)
  const lineWidthPt = Math.max(pixelsToPoints(visualStrokeWidthPx > 0 ? visualStrokeWidthPx : 1), 0.75)
  const dashType = resolvePptDashType(object)
  const lineProps: PptxGenJS.ShapeLineProps = {
    color: lineColor,
    width: lineWidthPt,
    ...(dashType ? { dashType } : {}),
  }

  // Emit from true endpoints: axis-aligned rules get orthogonal size 0 (avoids
  // vanishing hairlines), and diagonals get the correct / vs \ via flipH.
  // PPT’s default line is always top-left → bottom-right; opposite-sign deltas
  // need flipH or winding-path connectors mirror the wrong way.
  const { x1, y1, x2, y2 } = getFabricLineCanvasEndpoints(object)
  const dx = x2 - x1
  const dy = y2 - y1
  const flipH = dx * dy < 0

  slide.addShape('line', {
    x: pixelsToInches(Math.min(x1, x2)),
    y: pixelsToInches(Math.min(y1, y2)),
    w: pixelsToInches(Math.abs(dx)),
    h: pixelsToInches(Math.abs(dy)),
    ...(flipH ? { flipH: true } : {}),
    line: lineProps,
  })
}

function addFabricTriangleToSlide(slide: PptSlide, object: Triangle): void {
  addNativeShapeToSlide(slide, object, 'triangle')
}

export async function addFabricObjectToPptSlide(
  slide: PptSlide,
  object: FabricObject,
): Promise<void> {
  if (object.visible === false) return

  const objectType = object.type ?? ''

  if (EDITABLE_TEXT_OBJECT_TYPES.has(objectType)) {
    const textObject = object as Text | Textbox
    // Edits/paste can leave per-char fontFamily that would force raster even
    // though PPT emission only uses the object-level face.
    stripPerCharacterFontFamilyFromFabricText(textObject)
    if (shouldRasterizeFabricTextForPpt(textObject)) {
      await ensureFontsReadyForPptRaster(textObject.fontFamily)
      await addFabricRasterToSlide(slide, object)
      return
    }
    addFabricTextToSlide(slide, textObject)
    return
  }

  if (object instanceof Rect) {
    addFabricRectToSlide(slide, object)
    return
  }

  if (object instanceof Circle || object instanceof Ellipse) {
    addFabricEllipseToSlide(slide, object)
    return
  }

  if (object instanceof Line) {
    addFabricLineToSlide(slide, object)
    return
  }

  if (object instanceof Triangle) {
    addFabricTriangleToSlide(slide, object)
    return
  }

  if (
    object instanceof FabricImage ||
    object instanceof Path ||
    object instanceof Polygon ||
    object instanceof Polyline ||
    object instanceof Group
  ) {
    await addFabricRasterToSlide(slide, object)
    return
  }

  await addFabricRasterToSlide(slide, object)
}
