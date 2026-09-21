import opentype from 'opentype.js'

const LEGACY_USER_AGENT = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; Trident/4.0)'

export function isLikelyFontBinary(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false

  const view = new DataView(buffer)
  const tag = view.getUint32(0, false)

  return (
    tag === 0x00010000 ||
    tag === 0x74727565 ||
    tag === 0x4f54544f ||
    tag === 0x774f4646 ||
    tag === 0x774f4632
  )
}

export async function fetchFontArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(encodeURI(url))
    if (!response.ok) return null

    const buffer = await response.arrayBuffer()
    return isLikelyFontBinary(buffer) ? buffer : null
  } catch {
    return null
  }
}

export function parseOpenTypeFont(buffer: ArrayBuffer): opentype.Font | null {
  try {
    return opentype.parse(buffer)
  } catch {
    return null
  }
}

function googleCssBlockMatchesWeight(block: string, targetWeight: number): boolean {
  const rangeMatch = block.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/i)
  if (!rangeMatch) return targetWeight === 400

  const minWeight = Number.parseInt(rangeMatch[1] ?? '', 10)
  const maxWeight = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : minWeight
  if (!Number.isFinite(minWeight) || !Number.isFinite(maxWeight)) return false

  return targetWeight >= minWeight && targetWeight <= maxWeight
}

function googleCssBlockMatchesStyle(
  block: string,
  targetStyle: 'normal' | 'italic',
): boolean {
  const styleMatch = block.match(/font-style:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
  if (!styleMatch) return targetStyle === 'normal'
  return styleMatch === targetStyle
}

function extractFontUrlsFromGoogleCss(
  css: string,
  targetWeight: number,
  targetStyle: 'normal' | 'italic' = 'normal',
): string[] {
  const matchedUrls: string[] = []
  const styleFallbackUrls: string[] = []
  const fallbackUrls: string[] = []

  for (const block of css.split('@font-face')) {
    const urlMatches = block.matchAll(/url\(([^)]+)\)/gi)
    for (const match of urlMatches) {
      const url = match[1]?.trim().replace(/^["']|["']$/g, '')
      if (!url?.startsWith('http')) continue

      const matchesWeight = googleCssBlockMatchesWeight(block, targetWeight)
      const matchesStyle = googleCssBlockMatchesStyle(block, targetStyle)

      if (matchesWeight && matchesStyle) {
        matchedUrls.push(url)
      } else if (matchesWeight) {
        styleFallbackUrls.push(url)
      } else {
        fallbackUrls.push(url)
      }
    }
  }

  if (matchedUrls.length > 0) return matchedUrls
  if (styleFallbackUrls.length > 0) return styleFallbackUrls
  return fallbackUrls
}

export async function fetchGoogleFontBinary(
  googleFamily: string,
  targetWeight: number,
  targetStyle: 'normal' | 'italic' = 'normal',
): Promise<ArrayBuffer | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${googleFamily}&display=swap`

  try {
    const cssResponse = await fetch(cssUrl, {
      headers: { 'User-Agent': LEGACY_USER_AGENT },
    })
    if (!cssResponse.ok) return null

    const css = await cssResponse.text()
    const fontUrls = extractFontUrlsFromGoogleCss(css, targetWeight, targetStyle)

    for (const fontUrl of fontUrls) {
      const buffer = await fetchFontArrayBuffer(fontUrl)
      if (buffer) return buffer
    }
  } catch {
    // Ignore network/CSS parse failures; caller tries other sources.
  }

  return null
}
