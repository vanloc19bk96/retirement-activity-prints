import { StaticCanvas, type FabricObject } from 'fabric'

import {
  refreshFabricEditableTextMetricsAfterFontsReady,
  remeasureAllFabricEditableTextOnCanvas,
} from '@/utils/canvas-text'
import {
  applyAnonymousCrossOriginToFabricImageObjects,
  omitFabricCanvasJsonSurfaceFields,
} from '@/utils/canvas-template'
import { inlineFabricImagesForVectorExport } from '@/utils/fabric-images-for-vector-export'
import { convertSvgTextToOutlines } from '@/utils/svg-text-to-outlines'

const EDITABLE_TEXT_OBJECT_TYPES = new Set(['textbox', 'i-text', 'text'])
const SVG_VISIBILITY_HIDDEN_RE = /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:;|$)/i

function walkNestedFabricObjects(rootObjects: FabricObject[], visit: (obj: FabricObject) => void): void {
  for (const obj of rootObjects) {
    const getObjects = (obj as { getObjects?: () => FabricObject[] }).getObjects
    const children = typeof getObjects === 'function' ? getObjects.call(obj) : undefined
    if (children && children.length > 0) {
      walkNestedFabricObjects(children, visit)
    }
    visit(obj)
  }
}

function collectEditableTextObjects(canvas: StaticCanvas): FabricObject[] {
  const textObjects: FabricObject[] = []
  walkNestedFabricObjects(canvas.getObjects(), (obj) => {
    if (EDITABLE_TEXT_OBJECT_TYPES.has(obj.type ?? '')) {
      textObjects.push(obj)
    }
  })
  return textObjects
}

/**
 * Fabric toSVG emits visible:false objects with CSS `visibility: hidden`.
 * Text→outline conversion (and some PDF SVG renderers) drop that style, so
 * studio answer glyphs would print on puzzle pages. Exclude them first.
 */
function excludeInvisibleObjectsFromVectorExport(canvas: StaticCanvas): void {
  walkNestedFabricObjects(canvas.getObjects(), (obj) => {
    if (obj.visible === false) {
      obj.excludeFromExport = true
    }
  })
}

/** True when the element itself is marked visibility:hidden (attr or style). */
export function isSvgElementVisibilityHidden(el: Element): boolean {
  const attr = el.getAttribute('visibility')
  if (attr && attr.trim().toLowerCase() === 'hidden') return true
  return SVG_VISIBILITY_HIDDEN_RE.test(el.getAttribute('style') ?? '')
}

/**
 * Drop Fabric-hidden nodes before text outlining. Group children ignore
 * excludeFromExport in Fabric's Group._toSVG, so DOM cleanup is required.
 */
export function removeVisibilityHiddenSvgElements(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (isSvgElementVisibilityHidden(el)) {
      el.remove()
    }
  }
}

async function prepareFabricCanvasForVectorExport(canvas: StaticCanvas): Promise<void> {
  excludeInvisibleObjectsFromVectorExport(canvas)
  // Before toSVG: compact bitmaps so svg2pdf does not re-fetch full-res remote PNGs.
  await inlineFabricImagesForVectorExport(canvas)
  remeasureAllFabricEditableTextOnCanvas(canvas)
  const textObjects = collectEditableTextObjects(canvas)
  await Promise.all(textObjects.map((obj) => refreshFabricEditableTextMetricsAfterFontsReady(obj)))
  canvas.requestRenderAll()
}

/** Serialize an SVG element to a standalone, parseable XML string (with header). */
export function serializeSvgElementToString(svgElement: SVGSVGElement): string {
  const xml = new XMLSerializer().serializeToString(svgElement)
  if (xml.startsWith('<?xml')) return xml
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${xml}`
}

function parseSvgStringToElement(svgString: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Failed to parse Fabric canvas SVG for PDF export')
  }
  return doc.documentElement as unknown as SVGSVGElement
}

export async function renderStaticCanvasToSvgElement(
  canvas: StaticCanvas,
  baseWidthPixels: number,
  baseHeightPixels: number,
): Promise<SVGSVGElement> {
  await prepareFabricCanvasForVectorExport(canvas)

  const svgString = canvas.toSVG({
    viewBox: {
      x: 0,
      y: 0,
      width: baseWidthPixels,
      height: baseHeightPixels,
    },
    width: `${baseWidthPixels}`,
    height: `${baseHeightPixels}`,
  })

  const svgElement = parseSvgStringToElement(svgString)
  // Strip leftover hidden nodes (e.g. answer text inside groups) before outlining.
  removeVisibilityHiddenSvgElements(svgElement)
  await convertSvgTextToOutlines(svgElement)
  return svgElement
}

export async function renderCanvasJsonToSvgElement({
  canvasJson,
  baseWidthPixels,
  baseHeightPixels,
  backgroundColor,
}: {
  canvasJson: Record<string, unknown>
  baseWidthPixels: number
  baseHeightPixels: number
  backgroundColor: string
}): Promise<SVGSVGElement> {
  const element = document.createElement('canvas')
  const offscreen = new StaticCanvas(element, {
    width: baseWidthPixels,
    height: baseHeightPixels,
    backgroundColor,
    renderOnAddRemove: false,
    preserveObjectStacking: true,
  })

  try {
    const corsSafeJson = applyAnonymousCrossOriginToFabricImageObjects(canvasJson)
    const loadJson = omitFabricCanvasJsonSurfaceFields(corsSafeJson as Record<string, unknown>)
    await offscreen.loadFromJSON(loadJson)
    offscreen.setDimensions({ width: baseWidthPixels, height: baseHeightPixels })
    offscreen.backgroundColor = backgroundColor
    offscreen.setViewportTransform([1, 0, 0, 1, 0, 0])

    walkNestedFabricObjects(offscreen.getObjects(), (obj) => {
      ;(obj as FabricObject & { objectCaching?: boolean }).objectCaching = false
    })

    // Must await: bare `return promise` runs `finally` (dispose) before toSVG finishes.
    return await renderStaticCanvasToSvgElement(offscreen, baseWidthPixels, baseHeightPixels)
  } finally {
    offscreen.dispose()
  }
}
