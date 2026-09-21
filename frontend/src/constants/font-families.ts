import { buildFontFamilyCatalog } from '@/constants/font-family-catalog'
import type { FontFamilyOption } from '@/constants/font-family.types'

export type { FontFamilyOption } from '@/constants/font-family.types'

function normalizeFontToken(input: string): string {
  return input.trim().replace(/^["']|["']$/g, '').toLowerCase()
}

function getPrimaryFontToken(stackOrFamily: string): string {
  const first = stackOrFamily.split(',')[0] ?? stackOrFamily
  return normalizeFontToken(first)
}

export const FONT_FAMILIES: FontFamilyOption[] = buildFontFamilyCatalog()

export function getToolbarFontFamilies(): FontFamilyOption[] {
  return FONT_FAMILIES.filter((font) => font.showInToolbar !== false)
}

export function findFontFamilyOption(fontFamily: string): FontFamilyOption | undefined {
  const normalizedInput = normalizeFontToken(fontFamily)
  const primaryInput = getPrimaryFontToken(fontFamily)

  return FONT_FAMILIES.find((font) => {
    const normalizedValue = normalizeFontToken(font.value)
    const normalizedName = normalizeFontToken(font.name)
    const normalizedCanvas = font.canvasFontFamily
      ? normalizeFontToken(font.canvasFontFamily)
      : undefined
    const primaryCanvas = font.canvasFontFamily
      ? getPrimaryFontToken(font.canvasFontFamily)
      : undefined
    const legacyMatch =
      font.legacyNames?.some(
        (n) =>
          normalizeFontToken(n) === normalizedInput || normalizeFontToken(n) === primaryInput,
      ) ?? false

    return (
      legacyMatch ||
      normalizedInput === normalizedValue ||
      normalizedInput === normalizedName ||
      normalizedInput === normalizedCanvas ||
      normalizedInput === primaryCanvas ||
      primaryInput === normalizedValue ||
      primaryInput === normalizedName ||
      primaryInput === primaryCanvas
    )
  })
}

/** Map canvas `fontFamily` (may be a stack) back to a single FONT_FAMILIES.value for the toolbar select. */
export function normalizeFontFamilyForToolbar(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const normalized = raw.trim()

  for (const font of FONT_FAMILIES) {
    if (normalized === font.value) return font.value
    if (font.canvasFontFamily && normalized === font.canvasFontFamily) return font.value
  }

  const first = normalized.split(',')[0].trim().replace(/^["']|["']$/g, '')
  const nFirst = normalizeFontToken(first)
  for (const font of FONT_FAMILIES) {
    if (font.legacyNames?.some((l) => normalizeFontToken(l) === nFirst)) {
      return font.value
    }
  }
  for (const font of FONT_FAMILIES) {
    if (first === font.value) return font.value
    if (font.canvasFontFamily) {
      const primaryCanvas = font.canvasFontFamily
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '')
      if (first === primaryCanvas) return font.value
    }
  }

  return first || undefined
}
