import { findFontFamilyOption } from '@/constants/font-families'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { parseFabricFontFamily } from '@/utils/fabric-ppt-units'

/**
 * Faces PowerPoint can usually resolve without embedding. Unknown custom
 * faces (not in our catalog) are rasterized — pptxgenjs only writes
 * `fontFace` names and never embeds files.
 */
const PPT_SYSTEM_FONT_FACES = new Set([
  'Arial',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Microsoft Sans Serif',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
])

/** CSS generics / UI families that may appear in Fabric stacks after edits. */
const PPT_CSS_GENERIC_FACE_TO_NATIVE: Record<string, string> = {
  serif: 'Georgia',
  'sans-serif': 'Segoe UI',
  monospace: 'Consolas',
  cursive: 'Segoe UI',
  fantasy: 'Segoe UI',
  'system-ui': 'Segoe UI',
  'ui-sans-serif': 'Segoe UI',
  'ui-serif': 'Georgia',
  'ui-monospace': 'Consolas',
  'ui-rounded': 'Segoe UI',
}

type FabricTextFontSource = {
  fontFamily?: unknown
  styles?: unknown
}

function visitStyleFontFamilies(node: unknown, into: Set<string>): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) visitStyleFontFamilies(item, into)
    return
  }
  if (typeof node !== 'object') return

  const record = node as Record<string, unknown>
  if (typeof record.fontFamily === 'string' && record.fontFamily.trim()) {
    into.add(parseFabricFontFamily(record.fontFamily))
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') visitStyleFontFamilies(value, into)
  }
}

/** Object-level + per-character style faces (primary token only). */
export function collectFabricTextFontFaces(target: FabricTextFontSource): string[] {
  const faces = new Set<string>()
  if (typeof target.fontFamily === 'string' && target.fontFamily.trim()) {
    faces.add(parseFabricFontFamily(target.fontFamily))
  }
  visitStyleFontFamilies(target.styles, faces)
  return Array.from(faces)
}

export function mustRasterizePptFontFace(face: string): boolean {
  if (!face || PPT_SYSTEM_FONT_FACES.has(face)) return false
  if (PPT_CSS_GENERIC_FACE_TO_NATIVE[face]) return false

  // Toolbar / Studio catalog faces stay editable native text.
  if (findFontFamilyOption(face)) return false

  // Unknown custom face — do not assume the viewer's PowerPoint has it installed.
  return true
}

/**
 * Catalog + system faces stay editable. Only unknown custom faces rasterize.
 */
export function shouldRasterizeFabricTextForPpt(target: FabricTextFontSource): boolean {
  for (const face of collectFabricTextFontFaces(target)) {
    if (mustRasterizePptFontFace(face)) return true
  }
  return false
}

/**
 * Native PPT `fontFace` when text is not rasterized.
 * Emits the catalog primary name (Lora, PT Serif, …) so font changes stay
 * distinct — do not collapse every serif webfont to Georgia.
 */
export function resolvePptNativeFontFace(fontFamily: unknown): string {
  const face = parseFabricFontFamily(fontFamily)
  if (PPT_SYSTEM_FONT_FACES.has(face)) return face

  const genericNative = PPT_CSS_GENERIC_FACE_TO_NATIVE[face]
  if (genericNative) return genericNative

  const option = findFontFamilyOption(face)
  if (option) return option.value

  return face
}

/** Load webfont + wait for document.fonts before PPT `toDataURL` raster. */
export async function ensureFontsReadyForPptRaster(fontFamily: unknown): Promise<void> {
  const face = parseFabricFontFamily(fontFamily)
  await ensureFontFamilyLoaded(face)
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }
}
