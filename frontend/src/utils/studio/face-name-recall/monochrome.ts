const KEEP_COLOR =
  /^(none|transparent|white|#fff|#ffffff|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i

function normalizeColorToken(raw: string): string {
  const value = raw.trim()
  if (KEEP_COLOR.test(value) || value.startsWith('url(') || value.startsWith('url (')) {
    return value
  }
  return '#000000'
}

function rewriteStyleColors(styleValue: string): string {
  return styleValue.replace(
    /\b(fill|stroke)\s*:\s*([^;]+)/gi,
    (_match, prop: string, color: string) => `${prop}:${normalizeColorToken(color)}`,
  )
}

/** Strip every fill/stroke to black-on-white for KDP B&W interiors. */
export function toMonochromeSvg(svg: string): string {
  return svg
    .replace(
      /\b(fill|stroke)\s*=\s*(["'])(.*?)\2/gi,
      (_match, attr: string, quote: string, color: string) =>
        `${attr}=${quote}${normalizeColorToken(color)}${quote}`,
    )
    .replace(
      /\bstyle\s*=\s*(["'])(.*?)\1/gi,
      (_match, quote: string, styleValue: string) =>
        `style=${quote}${rewriteStyleColors(styleValue)}${quote}`,
    )
}
