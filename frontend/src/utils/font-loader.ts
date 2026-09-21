import { findFontFamilyOption } from '@/constants/font-families'
import type { FontFamilyOption } from '@/constants/font-family.types'

const loadedGoogleFontFamilies = new Set<string>()
const loadedLocalFontFamilies = new Set<string>()
const fontLoadPromises = new Map<string, Promise<void>>()

function appendGoogleFontStylesheet(googleFamily: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()

  if (loadedGoogleFontFamilies.has(googleFamily)) return Promise.resolve()
  loadedGoogleFontFamilies.add(googleFamily)

  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
}

async function loadLocalFontFace(
  fontFamily: string,
  localFilePath: string,
  weight: string,
  style: 'normal' | 'italic' = 'normal',
): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return

  const cacheKey = `${fontFamily}::${weight}::${style}`
  if (loadedLocalFontFamilies.has(cacheKey)) return

  try {
    const source = `url("${localFilePath}")`
    const fontFace = new FontFace(fontFamily, source, {
      weight,
      style,
      display: 'swap',
    })
    await fontFace.load()
    document.fonts.add(fontFace)
    loadedLocalFontFamilies.add(cacheKey)
  } catch {
    // Ignore local load failures; caller will fallback to other sources.
  }
}

async function loadLocalFontFiles(fontOption: FontFamilyOption): Promise<void> {
  const loadTargetFamily = getPrimaryFontFamily(fontOption.canvasFontFamily ?? fontOption.value)

  if (fontOption.localFilePath) {
    await loadLocalFontFace(loadTargetFamily, fontOption.localFilePath, '400')
  }
  if (fontOption.localFontFilesByWeight?.semiBold) {
    await loadLocalFontFace(loadTargetFamily, fontOption.localFontFilesByWeight.semiBold, '600')
  }
  if (fontOption.localFontFilesByWeight?.bold) {
    await loadLocalFontFace(loadTargetFamily, fontOption.localFontFilesByWeight.bold, '700')
  }
  if (fontOption.localFontFilesByStyle?.italic) {
    await loadLocalFontFace(loadTargetFamily, fontOption.localFontFilesByStyle.italic, '400', 'italic')
  }
  if (fontOption.localFontFilesByStyle?.boldItalic) {
    await loadLocalFontFace(loadTargetFamily, fontOption.localFontFilesByStyle.boldItalic, '700', 'italic')
  }
}

async function waitForFontReady(fontFamily: string, fontWeight = '400'): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return

  const maxAttempts = 20
  const intervalMs = 100

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const isReady = document.fonts.check(`${fontWeight} 16px "${fontFamily}"`)
      if (isReady) return
    } catch {
      // Ignore check errors
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function getPrimaryFontFamily(stackOrFamily: string): string {
  const first = stackOrFamily
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  return first || stackOrFamily.trim().replace(/^["']|["']$/g, '')
}

async function primeCanvasFontWeights(fontOption: FontFamilyOption): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return

  const loadTargetFamily = getPrimaryFontFamily(fontOption.canvasFontFamily ?? fontOption.value)
  const weights = ['400']

  if (fontOption.localFontFilesByWeight?.semiBold) weights.push('600')
  if (fontOption.localFontFilesByWeight?.bold) weights.push('700')

  for (const weight of weights) {
    try {
      await Promise.race([
        document.fonts.load(`${weight} 16px "${loadTargetFamily}"`),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
      await waitForFontReady(loadTargetFamily, weight)
    } catch {
      // Best-effort font priming.
    }
  }

  if (fontOption.localFontFilesByStyle?.italic) {
    try {
      await Promise.race([
        document.fonts.load(`italic 400 16px "${loadTargetFamily}"`),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } catch {
      // Best-effort font priming.
    }
  }

  if (fontOption.localFontFilesByStyle?.boldItalic) {
    try {
      await Promise.race([
        document.fonts.load(`italic 700 16px "${loadTargetFamily}"`),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } catch {
      // Best-effort font priming.
    }
  }
}

/** Start loading a font family; returns the same in-flight promise for duplicate requests. */
export function kickOffFontFamilyLoading(fontFamily: string): Promise<void> {
  const fontOption = findFontFamilyOption(fontFamily)
  if (!fontOption) return Promise.resolve()

  const existingPromise = fontLoadPromises.get(fontFamily)
  if (existingPromise) return existingPromise

  const loadPromise = (async () => {
    await loadLocalFontFiles(fontOption)

    if (fontOption.googleFamily) {
      await appendGoogleFontStylesheet(fontOption.googleFamily)
    }

    await primeCanvasFontWeights(fontOption)
  })()

  fontLoadPromises.set(fontFamily, loadPromise)
  return loadPromise
}

export async function ensureFontFamilyLoaded(fontFamily: string): Promise<void> {
  await kickOffFontFamilyLoading(fontFamily)
}
