import type { Canvas, StaticCanvas } from 'fabric'
import { Textbox, cache, util, type FabricObject } from 'fabric'
import { findFontFamilyOption } from '@/constants/font-families'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import {
  FABRIC_TEXT_FONT_SIZE_MULT,
  FABRIC_TEXT_LINE_HEIGHT,
  applyFabricTightTextVerticalMetrics,
  clearFabricTextInkMetricsCache,
} from '@/utils/fabric-text-vertical-metrics'

/**
 * Fabric caches `measureText` widths per font declaration. Measurements taken before a
 * webfont finishes loading stay wrong until the cache is cleared and `initDimensions()`
 * runs (see `fabric` `cache.clearFontCache` docs).
 */
export function clearFabricTextCharWidthCachesForFontFamily(fontFamilyDeclaration: string): void {
  if (typeof fontFamilyDeclaration !== 'string' || !fontFamilyDeclaration.trim()) return
  clearFabricTextInkMetricsCache()
  cache.clearFontCache(fontFamilyDeclaration)
  for (const part of fontFamilyDeclaration.split(',')) {
    const token = part.trim().replace(/^["']|["']$/g, '')
    if (token) cache.clearFontCache(token)
  }
}

/**
 * Ensure fonts are loaded, drop stale Fabric char-width cache, then re-measure the text
 * so the editing caret aligns with glyphs (fixes dotted/decorative fonts after lazy load).
 */
function getPrimaryFontFamilyToken(fontFamily: string): string {
  const first = fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  return first || fontFamily.trim().replace(/^["']|["']$/g, '')
}

async function loadFabricTextFontAtObjectMetrics(target: {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: string
}): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return

  const raw = target.fontFamily
  if (typeof raw !== 'string' || !raw.trim()) return

  const fontSize = typeof target.fontSize === 'number' && target.fontSize > 0 ? target.fontSize : 16
  const fontWeight = target.fontWeight ?? 'normal'
  const fontStyle = target.fontStyle === 'italic' ? 'italic' : 'normal'
  const primaryFamily = getPrimaryFontFamilyToken(raw)

  try {
    await Promise.race([
      document.fonts.load(`${fontStyle} ${fontWeight} ${fontSize}px "${primaryFamily}"`),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  } catch {
    // Best-effort; initDimensions still runs with whatever metrics are available.
  }
}

/**
 * Load a font and drop any char-width cache that was populated before it was
 * ready, ONCE — so a batch of textboxes can then call `initDimensions()`
 * synchronously against a warm, correct cache. Clearing the global Fabric cache
 * per textbox defeats the cache and thrashes CPU.
 */
export async function prepareFabricTextMetricsForFontFamily(fontFamily: string): Promise<void> {
  if (typeof fontFamily !== 'string' || !fontFamily.trim()) return

  await ensureFontFamilyLoaded(fontFamily)
  clearFabricTextCharWidthCachesForFontFamily(fontFamily)

  const option = findFontFamilyOption(fontFamily)
  if (option) {
    clearFabricTextCharWidthCachesForFontFamily(option.value)
    if (option.canvasFontFamily) clearFabricTextCharWidthCachesForFontFamily(option.canvasFontFamily)
  }
}

export async function refreshFabricEditableTextMetricsAfterFontsReady(target: {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: string
  initDimensions?: () => void
  setCoords?: () => void
}): Promise<void> {
  const raw = target.fontFamily
  if (typeof raw !== 'string' || !raw.trim()) {
    target.initDimensions?.()
    return
  }

  await ensureFontFamilyLoaded(raw)
  await loadFabricTextFontAtObjectMetrics(target)
  clearFabricTextCharWidthCachesForFontFamily(raw)
  const option = findFontFamilyOption(raw)
  if (option) {
    clearFabricTextCharWidthCachesForFontFamily(option.value)
    if (option.canvasFontFamily) clearFabricTextCharWidthCachesForFontFamily(option.canvasFontFamily)
  }

  target.initDimensions?.()
  const withCursor = target as { cursorOffsetCache?: Record<string, unknown> }
  if (withCursor.cursorOffsetCache) {
    withCursor.cursorOffsetCache = {}
  }
  target.setCoords?.()
}

const EDITABLE_TEXT_OBJECT_TYPES = new Set(['textbox', 'i-text', 'text'])

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

/**
 * After `loadFromJSON`, clear Fabric char-width caches for each text `fontFamily` and
 * re-run `initDimensions` (call when webfonts were already awaited — e.g. after restore).
 * Walks into {@link Group} so template text keeps correct metrics while still grouped.
 */
export function remeasureAllFabricEditableTextOnCanvas(canvas: Canvas | StaticCanvas): void {
  applyFabricTightTextVerticalMetrics()

  const objects = canvas.getObjects()
  const textObjects: FabricObject[] = []
  walkNestedFabricObjects(objects, (obj) => {
    if (EDITABLE_TEXT_OBJECT_TYPES.has(obj.type ?? '')) textObjects.push(obj)
  })

  const families = new Set<string>()
  for (const obj of textObjects) {
    const textObject = obj as { fontFamily?: string; set?: (props: Record<string, unknown>) => void }
    const ff = textObject.fontFamily
    if (typeof ff === 'string' && ff.trim()) families.add(ff)
    const option = typeof ff === 'string' ? findFontFamilyOption(ff) : undefined
    if (option?.canvasFontFamily && ff !== option.canvasFontFamily) {
      textObject.set?.({ fontFamily: option.canvasFontFamily })
    }
  }
  for (const ff of families) {
    clearFabricTextCharWidthCachesForFontFamily(ff)
    const option = findFontFamilyOption(ff)
    if (option) {
      clearFabricTextCharWidthCachesForFontFamily(option.value)
      if (option.canvasFontFamily) clearFabricTextCharWidthCachesForFontFamily(option.canvasFontFamily)
    }
  }
  for (const obj of textObjects) {
    const t = obj as {
      initDimensions?: () => void
      setCoords?: () => void
      set?: (props: Record<string, unknown>) => void
    }
    // Disable bitmap caching for editable text so scaling/zoom stays crisp (vector-like).
    // Re-apply tight vertical metrics in case the instance was created before the patch.
    t.set?.({
      objectCaching: false,
      noScaleCache: true,
      _fontSizeMult: FABRIC_TEXT_FONT_SIZE_MULT,
    })
    t.initDimensions?.()
    t.setCoords?.()
  }
  canvas.requestRenderAll()
}

/** Raster export prep: load webfonts, remeasure text, disable bitmap caches (crisp PNG/JPG). */
export async function prepareStaticCanvasForImageExport(canvas: Canvas | StaticCanvas): Promise<void> {
  remeasureAllFabricEditableTextOnCanvas(canvas)

  const textObjects: FabricObject[] = []
  walkNestedFabricObjects(canvas.getObjects(), (obj) => {
    if (EDITABLE_TEXT_OBJECT_TYPES.has(obj.type ?? '')) textObjects.push(obj)
    ;(obj as FabricObject & { objectCaching?: boolean; noScaleCache?: boolean }).objectCaching = false
    ;(obj as FabricObject & { noScaleCache?: boolean }).noScaleCache = true
  })
  await Promise.all(textObjects.map((obj) => refreshFabricEditableTextMetricsAfterFontsReady(obj)))

  canvas.requestRenderAll()
}

const TEXT_OBJECT_SERIALIZE_PROPS: string[] = []

type AddTextToCanvasOptions = {
  canvas: Canvas
  text: string
  fontSize: number
  fontWeight: number | 'normal' | 'bold'
  clientX: number
  clientY: number
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function addTextToFabricCanvasAtClientPoint(options: AddTextToCanvasOptions): void {
  const { canvas, text, fontSize, fontWeight, clientX, clientY } = options
  if (!text?.trim()) return

  const zoom = canvas.getZoom()
  const baseWidth = canvas.getWidth() / zoom
  const baseHeight = canvas.getHeight() / zoom

  const element =
    ((canvas as any).getElement?.() as HTMLCanvasElement | null | undefined) ??
    ((canvas as any).lowerCanvasEl as HTMLCanvasElement | null | undefined) ??
    null

  let pointer = { x: baseWidth / 2, y: baseHeight / 2 }

  if (element) {
    const rect = element.getBoundingClientRect()
    const x = (clientX - rect.left) / zoom
    const y = (clientY - rect.top) / zoom
    pointer = {
      x: clampNumber(x, 0, baseWidth),
      y: clampNumber(y, 0, baseHeight),
    }
  }

  applyFabricTightTextVerticalMetrics()

  const textbox = new Textbox(text, {
    originX: 'center',
    originY: 'center',
    left: clampNumber(pointer.x, 0, baseWidth),
    top: clampNumber(pointer.y, 0, baseHeight),
    fontSize,
    fontWeight,
    lineHeight: FABRIC_TEXT_LINE_HEIGHT,
    fill: '#0f172a',
    editable: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    objectCaching: false,
    noScaleCache: true,
  })

  canvas.add(textbox)
  canvas.bringObjectToFront(textbox)
  canvas.setActiveObject(textbox)
  canvas.requestRenderAll()
}

/**
 * Legacy projects stored editable text as `IText`, which ignores box width for wrapping.
 * Rehydrate as `Textbox` so horizontal resize (ml/mr) reflows lines.
 */
async function interactiveTextToTextbox(obj: FabricObject): Promise<FabricObject> {
  if (obj.type !== 'i-text') return obj
  const plain = obj.toObject(TEXT_OBJECT_SERIALIZE_PROPS) as Record<string, unknown>
  plain.type = 'Textbox'
  try {
    const enlivened = (await util.enlivenObjects([plain])) as FabricObject[]
    return enlivened[0] ?? obj
  } catch {
    return obj
  }
}

export async function upgradeInteractiveTextToTextbox(canvas: Canvas): Promise<void> {
  const stack = canvas.getObjects()
  for (let i = stack.length - 1; i >= 0; i--) {
    const obj = stack[i]
    if (obj.type !== 'i-text') continue

    const replacement = await interactiveTextToTextbox(obj)
    if (replacement === obj) continue

    canvas.remove(obj)
    canvas.insertAt(i, replacement)
    replacement.setCoords()
  }
}

/** Copy/paste enlivens legacy `i-text`; normalize so resize reflows. */
export async function normalizePastedTextObjects(objects: FabricObject[]): Promise<void> {
  for (let i = 0; i < objects.length; i++) {
    const next = await interactiveTextToTextbox(objects[i])
    if (next !== objects[i]) objects[i] = next
  }
}

type FabricTextStyles = Record<string, Record<string, Record<string, unknown>>>

/**
 * Fabric stores typography in per-character `styles` (e.g. after paste from another text).
 * Those override object-level `fontFamily` / `fontSize`; strip so the box keeps its settings.
 * @returns true if `styles` were mutated
 */
export function stripPerCharacterFontFamilyFromFabricText(target: unknown): boolean {
  const styles = (target as { styles?: FabricTextStyles | null })?.styles
  if (!styles || typeof styles !== 'object') return false

  let didMutate = false

  for (const lineKey of Object.keys(styles)) {
    const line = styles[lineKey]
    if (!line || typeof line !== 'object') continue

    for (const charKey of Object.keys(line)) {
      const charStyle = line[charKey]
      if (!charStyle || typeof charStyle !== 'object') continue

      if (
        charStyle.fontFamily !== undefined ||
        charStyle.font !== undefined ||
        charStyle.fontSize !== undefined
      ) {
        didMutate = true
      }

      delete charStyle.fontFamily
      delete charStyle.font
      delete charStyle.fontSize

      if (Object.keys(charStyle).length === 0) {
        delete line[charKey]
        didMutate = true
      }
    }

    if (Object.keys(line).length === 0) {
      delete styles[lineKey]
      didMutate = true
    }
  }

  return didMutate
}

/**
 * Fabric can keep per-character `fill` after clipboard paste while editing text.
 * That overrides object-level `fill`, so toolbar color changes seem to "not work".
 * Remove char-level fill to let object-level color apply uniformly.
 */
export function stripPerCharacterFillFromFabricText(target: unknown): boolean {
  const styles = (target as { styles?: FabricTextStyles | null })?.styles
  if (!styles || typeof styles !== 'object') return false

  let didMutate = false

  for (const lineKey of Object.keys(styles)) {
    const line = styles[lineKey]
    if (!line || typeof line !== 'object') continue

    for (const charKey of Object.keys(line)) {
      const charStyle = line[charKey]
      if (!charStyle || typeof charStyle !== 'object') continue
      if (charStyle.fill === undefined) continue

      delete charStyle.fill
      didMutate = true

      if (Object.keys(charStyle).length === 0) {
        delete line[charKey]
      }
    }

    if (Object.keys(line).length === 0) {
      delete styles[lineKey]
    }
  }

  return didMutate
}

/**
 * Remove character-level typography overrides that can block toolbar toggles
 * (bold/italic/underline) after pasting rich text into Fabric text objects.
 */
export function stripPerCharacterTextStyleFromFabricText(target: unknown): boolean {
  const styles = (target as { styles?: FabricTextStyles | null })?.styles
  if (!styles || typeof styles !== 'object') return false

  let didMutate = false

  for (const lineKey of Object.keys(styles)) {
    const line = styles[lineKey]
    if (!line || typeof line !== 'object') continue

    for (const charKey of Object.keys(line)) {
      const charStyle = line[charKey]
      if (!charStyle || typeof charStyle !== 'object') continue

      if (
        charStyle.fontWeight === undefined &&
        charStyle.fontStyle === undefined &&
        charStyle.underline === undefined
      ) {
        continue
      }

      delete charStyle.fontWeight
      delete charStyle.fontStyle
      delete charStyle.underline
      didMutate = true

      if (Object.keys(charStyle).length === 0) {
        delete line[charKey]
      }
    }

    if (Object.keys(line).length === 0) {
      delete styles[lineKey]
    }
  }

  return didMutate
}

