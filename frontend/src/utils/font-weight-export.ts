import type { FontFamilyOption } from '@/constants/font-family.types'

export type FontExportStyle = 'normal' | 'italic'

/** Matches browser synthetic oblique used when a family has no real italic face. */
export const FAUX_ITALIC_SKEW_DEGREES = -14

export function resolveNumericFontWeight(weightRaw: string | null): number {
  if (!weightRaw) return 400

  const normalized = weightRaw.trim().toLowerCase()
  if (normalized === 'normal') return 400
  if (normalized === 'bold' || normalized === 'bolder') return 700

  const numeric = Number.parseInt(normalized, 10)
  return Number.isFinite(numeric) ? numeric : 400
}

export function resolveFontExportStyle(styleRaw: string | null): FontExportStyle {
  if (!styleRaw) return 'normal'
  const normalized = styleRaw.trim().toLowerCase()
  return normalized === 'italic' || normalized === 'oblique' ? 'italic' : 'normal'
}

function sanitizeFontFamilyForFilename(fontFamily: string): string {
  return fontFamily.replace(/[\\/:"*?<>|]+/g, '').trim()
}

function pushUnique(candidateUrls: string[], url: string): void {
  if (!candidateUrls.includes(url)) {
    candidateUrls.push(url)
  }
}

function appendRegularFontCandidateUrls(candidateUrls: string[], sanitizedFamily: string): void {
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}.otf`)
}

function appendSemiBoldFontCandidateUrls(candidateUrls: string[], sanitizedFamily: string): void {
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily} SemiBold.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}-SemiBold.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}SemiBold.ttf`)
}

function appendBoldFontCandidateUrls(candidateUrls: string[], sanitizedFamily: string): void {
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily} Bold.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily} Bold.otf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}-Bold.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}-Bold.otf`)
}

function appendItalicFontCandidateUrls(candidateUrls: string[], sanitizedFamily: string): void {
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily} Italic.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}-Italic.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}Italic.ttf`)
}

function appendBoldItalicFontCandidateUrls(candidateUrls: string[], sanitizedFamily: string): void {
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily} Bold Italic.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}-BoldItalic.ttf`)
  pushUnique(candidateUrls, `/fonts/${sanitizedFamily}BoldItalic.ttf`)
}

function addWeightTierCandidates(
  candidateUrls: string[],
  fontOption: FontFamilyOption,
  sanitizedFamily: string,
  fontWeight: number,
): void {
  const addSemiBold = (): void => {
    if (fontOption.localFontFilesByWeight?.semiBold) {
      pushUnique(candidateUrls, fontOption.localFontFilesByWeight.semiBold)
    }
    appendSemiBoldFontCandidateUrls(candidateUrls, sanitizedFamily)
  }

  const addBold = (): void => {
    if (fontOption.localFontFilesByWeight?.bold) {
      pushUnique(candidateUrls, fontOption.localFontFilesByWeight.bold)
    }
    appendBoldFontCandidateUrls(candidateUrls, sanitizedFamily)
  }

  const addRegular = (): void => {
    if (fontOption.localFilePath) {
      pushUnique(candidateUrls, fontOption.localFilePath)
    }
    appendRegularFontCandidateUrls(candidateUrls, sanitizedFamily)
  }

  if (fontWeight >= 700) {
    addBold()
  } else if (fontWeight >= 600) {
    addSemiBold()
  } else {
    addRegular()
  }
}

/**
 * Build ordered local font URLs for outline export.
 * Only the requested weight/style tier — no cross-tier file substitution.
 */
export function buildLocalFontCandidateUrls(
  fontOption: FontFamilyOption,
  fontWeight: number,
  fontStyle: FontExportStyle = 'normal',
): string[] {
  const sanitized = sanitizeFontFamilyForFilename(fontOption.value)
  const candidateUrls: string[] = []

  if (fontStyle === 'italic') {
    if (fontWeight >= 700) {
      if (fontOption.localFontFilesByStyle?.boldItalic) {
        pushUnique(candidateUrls, fontOption.localFontFilesByStyle.boldItalic)
      }
      appendBoldItalicFontCandidateUrls(candidateUrls, sanitized)
    } else if (fontWeight >= 600) {
      if (fontOption.localFontFilesByWeight?.semiBold) {
        pushUnique(candidateUrls, fontOption.localFontFilesByWeight.semiBold)
      }
      appendSemiBoldFontCandidateUrls(candidateUrls, sanitized)
      if (fontOption.localFontFilesByStyle?.boldItalic) {
        pushUnique(candidateUrls, fontOption.localFontFilesByStyle.boldItalic)
      }
      appendBoldItalicFontCandidateUrls(candidateUrls, sanitized)
    }

    if (fontOption.localFontFilesByStyle?.italic) {
      pushUnique(candidateUrls, fontOption.localFontFilesByStyle.italic)
    }
    appendItalicFontCandidateUrls(candidateUrls, sanitized)

    return candidateUrls
  }

  addWeightTierCandidates(candidateUrls, fontOption, sanitized, fontWeight)

  return candidateUrls
}

export function resolveEffectiveFontWeight(
  fontOption: FontFamilyOption | undefined,
  fontWeight: number,
): number {
  if (
    fontWeight >= 600 &&
    fontWeight < 700 &&
    fontOption &&
    !fontOption.localFontFilesByWeight?.semiBold
  ) {
    return 700
  }
  return fontWeight
}

export function resolveGoogleFontTargetWeight(fontWeight: number): number {
  if (fontWeight >= 700) return 700
  if (fontWeight >= 600) return 600
  if (fontWeight >= 500) return 500
  return 400
}
