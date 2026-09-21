import opentype from 'opentype.js'

import { findFontFamilyOption } from '@/constants/font-families'
import {
  fetchFontArrayBuffer,
  fetchGoogleFontBinary,
  parseOpenTypeFont,
} from '@/utils/fetch-font-binary'
import {
  buildLocalFontCandidateUrls,
  FAUX_ITALIC_SKEW_DEGREES,
  resolveEffectiveFontWeight,
  resolveFontExportStyle,
  resolveGoogleFontTargetWeight,
  resolveNumericFontWeight,
  type FontExportStyle,
} from '@/utils/font-weight-export'

type LoadedFont = {
  font: opentype.Font
  sourceUrl: string
  usesFauxItalic: boolean
  usesFauxBold: boolean
}

type TextSegment = {
  text: string
  x: number
  y: number
  fontSize: number
  fill: string
  isUnderline: boolean
  underlineThicknessPx: number
  fontStyle: FontExportStyle
  fontWeight: number
}

export class FontOutlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontOutlineError'
  }
}

const fontCache = new Map<string, Promise<LoadedFont | null>>()

const GLYPH_PATH_DECIMALS = 2
const FAUX_BOLD_STROKE_WIDTH_EM = 0.045
/** VS1–VS16 — many catalog fonts map these to .notdef (tofu) during outline export. */
const VARIATION_SELECTOR_PATTERN = /[\uFE00-\uFE0F]/g

/**
 * ASCII stand-ins when the outline font lacks a glyph (PDF/SVG tofu boxes).
 * Canvas can fall back across font stacks; opentype outlining cannot.
 */
const MISSING_GLYPH_FALLBACKS: Record<string, string> = {
  '\u2190': '<-', // ←
  '\u2191': '^', // ↑
  '\u2192': '->', // →
  '\u2193': 'v', // ↓
  '\u2194': '<->', // ↔
  '\u21D2': '=>', // ⇒
  '\u2026': '...', // …
  '\u2013': '-', // –
  '\u2014': '-', // —
  '\u00D7': 'x', // ×
  '\u22C5': '.', // ⋅
  '\u00B7': '.', // ·
  '\u2022': '.', // •
  '\u25B2': '^', // ▲
  '\u25B3': '^', // △
  '\u25BC': 'v', // ▼
  '\u25BD': 'v', // ▽
  '\u25B6': '>', // ▶
  '\u25C0': '<', // ◀
  '\u25CF': 'o', // ●
  '\u25A0': '#', // ■
  '\u25C6': '*', // ◆
  '\u2605': '*', // ★
  '\u2227': '^', // ∧ (legacy Futoshiki vertical signs)
  '\u2228': 'v', // ∨
}

function stripVariationSelectors(text: string): string {
  return text.replace(VARIATION_SELECTOR_PATTERN, '')
}

function isMissingGlyph(font: opentype.Font, char: string): boolean {
  const glyph = font.charToGlyph(char)
  if (!glyph) return true
  if (glyph.index === 0) return true
  if (glyph.name === '.notdef') return true
  return false
}

/** Replace characters the font cannot outline so PDF/SVG never emit tofu. */
export function sanitizeTextForOutlineFont(text: string, font: opentype.Font): string {
  let out = ''
  for (const char of text) {
    if (!isMissingGlyph(font, char)) {
      out += char
      continue
    }
    out += MISSING_GLYPH_FALLBACKS[char] ?? '?'
  }
  return out
}

// Bundled serif used when a text object references a font removed from the catalog
// (e.g. legacy "Times New Roman" saved before the font was dropped). Prevents a single
// stale reference from failing the entire vector export.
const FALLBACK_EXPORT_FONT_FAMILY = 'Lora'

function pickPrimaryFontFamily(fontFamilyRaw: string): string {
  const first = fontFamilyRaw
    .split(',')
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .find(Boolean)
  return first ?? fontFamilyRaw.trim().replace(/^['"]|['"]$/g, '')
}

function buildFontCacheKey(fontFamily: string, fontWeight: number, fontStyle: FontExportStyle): string {
  return `${fontFamily}::${fontWeight}::${fontStyle}`
}

async function tryLoadFontFromUrls(candidateUrls: string[]): Promise<LoadedFont | null> {
  for (const url of candidateUrls) {
    const arrayBuffer = await fetchFontArrayBuffer(url)
    if (!arrayBuffer) continue

    const font = parseOpenTypeFont(arrayBuffer)
    if (font) {
      return { font, sourceUrl: url, usesFauxItalic: false, usesFauxBold: false }
    }
  }

  return null
}

async function loadFontForFamily(
  fontFamily: string,
  fontWeight: number,
  fontStyle: FontExportStyle = 'normal',
): Promise<LoadedFont | null> {
  const fontOption = findFontFamilyOption(fontFamily)
  if (!fontOption) {
    return null
  }

  const exactMatch = await tryLoadFontFromUrls(
    buildLocalFontCandidateUrls(fontOption, fontWeight, fontStyle),
  )
  if (exactMatch) {
    return exactMatch
  }

  if (fontStyle === 'normal' && fontWeight >= 700) {
    const uprightRegular = await tryLoadFontFromUrls(
      buildLocalFontCandidateUrls(fontOption, 400, 'normal'),
    )
    if (uprightRegular) {
      // No real bold face (e.g. DotGothic16); match browser synthetic bold via stroke.
      return { ...uprightRegular, usesFauxBold: true }
    }
  }

  if (fontStyle === 'italic') {
    const uprightMatch = await tryLoadFontFromUrls(
      buildLocalFontCandidateUrls(fontOption, fontWeight, 'normal'),
    )
    if (uprightMatch) {
      return { ...uprightMatch, usesFauxItalic: true }
    }

    const regularUpright = await tryLoadFontFromUrls(
      buildLocalFontCandidateUrls(fontOption, 400, 'normal'),
    )
    if (regularUpright) {
      return { ...regularUpright, usesFauxItalic: true }
    }
  }

  if (fontOption.googleFamily) {
    const targetWeight = resolveGoogleFontTargetWeight(fontWeight)
    const googleBuffer = await fetchGoogleFontBinary(fontOption.googleFamily, targetWeight, fontStyle)
    if (googleBuffer) {
      const font = parseOpenTypeFont(googleBuffer)
      if (font) {
        return {
          font,
          sourceUrl: `google:${fontOption.googleFamily}:${targetWeight}:${fontStyle}`,
          usesFauxItalic: false,
          usesFauxBold: false,
        }
      }
    }

    if (fontStyle === 'italic') {
      const uprightGoogleBuffer = await fetchGoogleFontBinary(
        fontOption.googleFamily,
        targetWeight,
        'normal',
      )
      if (uprightGoogleBuffer) {
        const font = parseOpenTypeFont(uprightGoogleBuffer)
        if (font) {
          return {
            font,
            sourceUrl: `google:${fontOption.googleFamily}:${targetWeight}:normal`,
            usesFauxItalic: true,
            usesFauxBold: false,
          }
        }
      }
    }
  }

  return null
}

function getCachedFont(
  fontFamily: string,
  fontWeight: number,
  fontStyle: FontExportStyle,
): Promise<LoadedFont | null> {
  const cacheKey = buildFontCacheKey(fontFamily, fontWeight, fontStyle)
  const cached = fontCache.get(cacheKey)
  if (cached) return cached

  const pending = loadFontForFamily(fontFamily, fontWeight, fontStyle)
  fontCache.set(cacheKey, pending)
  return pending
}

function getSvgNumberAttribute(el: Element, name: string): number | null {
  const raw = el.getAttribute(name)
  if (!raw) return null
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function getSvgStyleProperty(el: Element, propertyName: string): string | null {
  const style = el.getAttribute('style') ?? ''
  const escapedName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = style.match(new RegExp(`(?:^|;)\\s*${escapedName}\\s*:\\s*([^;]+)\\s*(?:;|$)`, 'i'))
  return match?.[1]?.trim() ?? null
}

function getExplicitSvgFill(el: Element): string | null {
  const fillAttr = el.getAttribute('fill')
  if (fillAttr && fillAttr !== 'none') return fillAttr

  const fromStyle = getSvgStyleProperty(el, 'fill')
  if (fromStyle && fromStyle !== 'none') return fromStyle

  return null
}

function resolveSvgTextFill(el: Element): string {
  let current: Element | null = el
  while (current) {
    const explicitFill = getExplicitSvgFill(current)
    if (explicitFill) return explicitFill
    current = current.parentElement
  }

  return '#000000'
}

function getSvgFontStyle(el: Element): string | null {
  const styleAttr = el.getAttribute('font-style')
  if (styleAttr) return styleAttr
  return getSvgStyleProperty(el, 'font-style')
}

function resolveSegmentFontStyle(el: Element, parentTextEl: Element): FontExportStyle {
  const ownStyle = getSvgFontStyle(el)
  if (ownStyle && ownStyle.trim().toLowerCase() !== 'normal') {
    return resolveFontExportStyle(ownStyle)
  }
  return resolveFontExportStyle(getSvgFontStyle(parentTextEl))
}

function resolveSegmentFontWeight(el: Element, parentTextEl: Element): number {
  return resolveNumericFontWeight(getSvgFontWeight(el) ?? getSvgFontWeight(parentTextEl))
}

function getSvgFontWeight(el: Element): string | null {
  const weightAttr = el.getAttribute('font-weight')
  if (weightAttr) return weightAttr
  return getSvgStyleProperty(el, 'font-weight')
}

function getSvgTextDecoration(el: Element): string | null {
  const decorationAttr = el.getAttribute('text-decoration')
  if (decorationAttr) return decorationAttr
  return getSvgStyleProperty(el, 'text-decoration')
}

function hasSvgUnderline(el: Element, parentTextEl: Element): boolean {
  const decorations = [getSvgTextDecoration(el), getSvgTextDecoration(parentTextEl)]
  return decorations.some((value) => value?.split(/\s+/).includes('underline') ?? false)
}

function resolveUnderlineThicknessPx(
  el: Element,
  parentTextEl: Element,
  fontSize: number,
): number {
  const raw =
    getSvgStyleProperty(el, 'text-decoration-thickness') ??
    el.getAttribute('text-decoration-thickness') ??
    getSvgStyleProperty(parentTextEl, 'text-decoration-thickness') ??
    parentTextEl.getAttribute('text-decoration-thickness')

  if (raw?.endsWith('%')) {
    const percent = Number.parseFloat(raw)
    if (Number.isFinite(percent) && percent > 0) {
      return Math.max(0.5, (fontSize * percent) / 100)
    }
  }

  const numeric = raw ? Number.parseFloat(raw) : Number.NaN
  if (Number.isFinite(numeric) && numeric > 0) return numeric

  return Math.max(0.5, fontSize / 15)
}

function resolveUnderlineTopOffset(font: opentype.Font, fontSize: number): number {
  const unitsPerEm = font.unitsPerEm || 1000
  const underlinePosition = font.tables.post?.underlinePosition
  if (typeof underlinePosition === 'number') {
    return (-underlinePosition / unitsPerEm) * fontSize
  }
  return fontSize * 0.1
}

function createUnderlinePathElement({
  owner,
  startX,
  baselineY,
  width,
  font,
  fontSize,
  fill,
  thicknessPx,
}: {
  owner: Document
  startX: number
  baselineY: number
  width: number
  font: opentype.Font
  fontSize: number
  fill: string
  thicknessPx: number
}): SVGPathElement {
  const topY = baselineY + resolveUnderlineTopOffset(font, fontSize)
  const pathEl = owner.createElementNS('http://www.w3.org/2000/svg', 'path')
  pathEl.setAttribute(
    'd',
    `M ${startX} ${topY} L ${startX + width} ${topY} L ${startX + width} ${topY + thicknessPx} L ${startX} ${topY + thicknessPx} Z`,
  )
  pathEl.setAttribute('fill', fill)
  return pathEl
}

function getDirectTspanChildren(textEl: Element): Element[] {
  return Array.from(textEl.children).filter((child) => child.localName === 'tspan')
}

function collectTextSegments(textEl: Element): TextSegment[] {
  const defaultFontSize = getSvgNumberAttribute(textEl, 'font-size') ?? 16
  const defaultX = getSvgNumberAttribute(textEl, 'x') ?? 0
  const defaultY = getSvgNumberAttribute(textEl, 'y') ?? 0
  const defaultFill = resolveSvgTextFill(textEl)
  const tspans = getDirectTspanChildren(textEl)

  if (tspans.length === 0) {
    const text = (textEl.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return []
    const isUnderline = hasSvgUnderline(textEl, textEl)
    return [{
      text,
      x: defaultX,
      y: defaultY,
      fontSize: defaultFontSize,
      fill: defaultFill,
      isUnderline,
      underlineThicknessPx: resolveUnderlineThicknessPx(textEl, textEl, defaultFontSize),
      fontStyle: resolveSegmentFontStyle(textEl, textEl),
      fontWeight: resolveSegmentFontWeight(textEl, textEl),
    }]
  }

  const segments: TextSegment[] = []
  let cursorY = defaultY

  for (const tspan of tspans) {
    const text = (tspan.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    const x = getSvgNumberAttribute(tspan, 'x') ?? defaultX
    const yAttribute = getSvgNumberAttribute(tspan, 'y')
    const dy = getSvgNumberAttribute(tspan, 'dy') ?? 0
    const y = yAttribute ?? cursorY + dy
    cursorY = y

    const fontSize = getSvgNumberAttribute(tspan, 'font-size') ?? defaultFontSize
    const isUnderline = hasSvgUnderline(tspan, textEl)

    segments.push({
      text,
      x,
      y,
      fontSize,
      fill: resolveSvgTextFill(tspan),
      isUnderline,
      underlineThicknessPx: resolveUnderlineThicknessPx(tspan, textEl, fontSize),
      fontStyle: resolveSegmentFontStyle(tspan, textEl),
      fontWeight: resolveSegmentFontWeight(tspan, textEl),
    })
  }

  return segments
}

function replaceTextNodeWithPaths(textEl: Element, outputElements: SVGElement[]): void {
  const owner = textEl.ownerDocument
  const parentTransform = textEl.getAttribute('transform')

  if (outputElements.length === 1 && !parentTransform) {
    textEl.parentNode?.replaceChild(outputElements[0]!, textEl)
    return
  }

  const group = owner.createElementNS('http://www.w3.org/2000/svg', 'g')
  if (parentTransform) {
    group.setAttribute('transform', parentTransform)
  }
  for (const outputEl of outputElements) {
    group.appendChild(outputEl)
  }
  textEl.parentNode?.replaceChild(group, textEl)
}

function skewXCoordinate(
  x: number,
  y: number,
  originX: number,
  originY: number,
  skewTan: number,
): number {
  return originX + (x - originX) + skewTan * (y - originY)
}

type OpenTypePathCommand = {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

function applySkewXToOpenTypePath(
  path: { commands: OpenTypePathCommand[] },
  originX: number,
  originY: number,
  skewDegrees: number,
): void {
  const skewTan = Math.tan((skewDegrees * Math.PI) / 180)

  for (const command of path.commands) {
    if (command.x1 !== undefined && command.y1 !== undefined) {
      command.x1 = skewXCoordinate(command.x1, command.y1, originX, originY, skewTan)
    }
    if (command.x2 !== undefined && command.y2 !== undefined) {
      command.x2 = skewXCoordinate(command.x2, command.y2, originX, originY, skewTan)
    }
    if (command.x !== undefined && command.y !== undefined) {
      command.x = skewXCoordinate(command.x, command.y, originX, originY, skewTan)
    }
  }
}

function applySkewXToSvgPathElement(
  pathEl: SVGPathElement,
  originX: number,
  originY: number,
  skewDegrees: number,
): void {
  const pathData = pathEl.getAttribute('d')
  if (!pathData) return

  const skewTan = Math.tan((skewDegrees * Math.PI) / 180)
  const transformed = pathData.replace(
    /(-?\d*\.?\d+(?:e[-+]?\d+)?)\s+(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi,
    (_match, rawX: string, rawY: string) => {
      const x = Number.parseFloat(rawX)
      const y = Number.parseFloat(rawY)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return `${rawX} ${rawY}`
      const nextX = skewXCoordinate(x, y, originX, originY, skewTan)
      return `${toFixedPathCoordinate(nextX)} ${toFixedPathCoordinate(y)}`
    },
  )
  pathEl.setAttribute('d', transformed)
}

function toFixedPathCoordinate(value: number): string {
  return value.toFixed(GLYPH_PATH_DECIMALS)
}

function computeAnchorAdjustedX({
  x,
  textAnchor,
  text,
  font,
  fontSize,
}: {
  x: number
  textAnchor: string | null
  text: string
  font: opentype.Font
  fontSize: number
}): number {
  if (!textAnchor) return x

  const anchor = textAnchor.trim()
  if (anchor !== 'middle' && anchor !== 'end') return x

  const width = font.getAdvanceWidth(text, fontSize)
  if (!Number.isFinite(width)) return x

  if (anchor === 'middle') return x - width / 2
  return x - width
}

async function outlineTextElement(textEl: Element): Promise<void> {
  const segments = collectTextSegments(textEl)
  if (segments.length === 0) return

  const fontFamilyRaw = textEl.getAttribute('font-family') ?? ''
  if (!fontFamilyRaw.trim()) {
    throw new FontOutlineError('Text element is missing font-family for export')
  }

  const requestedFamily = pickPrimaryFontFamily(fontFamilyRaw)
  let fontFamily = requestedFamily
  let fontOption = findFontFamilyOption(requestedFamily)
  if (!fontOption) {
    const fallbackOption = findFontFamilyOption(FALLBACK_EXPORT_FONT_FAMILY)
    if (!fallbackOption) {
      throw new FontOutlineError(`Unknown font family "${requestedFamily}" for export`)
    }
    console.warn(
      `Font "${requestedFamily}" is not in the catalog; falling back to "${FALLBACK_EXPORT_FONT_FAMILY}" for export.`,
    )
    fontFamily = FALLBACK_EXPORT_FONT_FAMILY
    fontOption = fallbackOption
  }

  const textAnchor = textEl.getAttribute('text-anchor')
  const owner = textEl.ownerDocument
  const outputElements: SVGElement[] = []

  for (const segment of segments) {
    const fontWeight = resolveEffectiveFontWeight(fontOption, segment.fontWeight)
    const loadedFont = await getCachedFont(fontFamily, fontWeight, segment.fontStyle)
    if (!loadedFont) {
      throw new FontOutlineError(
        `Failed to load font "${fontOption.value}" (weight ${fontWeight}, style ${segment.fontStyle}) for export`,
      )
    }

    const { font, usesFauxBold, usesFauxItalic } = loadedFont
    const outlineText = sanitizeTextForOutlineFont(
      stripVariationSelectors(segment.text),
      font,
    )
    if (!outlineText) continue
    const adjustedX = computeAnchorAdjustedX({
      x: segment.x,
      textAnchor,
      text: outlineText,
      font,
      fontSize: segment.fontSize,
    })
    const path = font.getPath(outlineText, adjustedX, segment.y, segment.fontSize)
    if (usesFauxItalic) {
      applySkewXToOpenTypePath(path, adjustedX, segment.y, FAUX_ITALIC_SKEW_DEGREES)
    }
    const pathEl = owner.createElementNS('http://www.w3.org/2000/svg', 'path')
    // 2 decimals = 0.01px precision (imperceptible at 300 DPI) but cuts outlined
    // path-string size ~40%, which is the biggest driver of PDF memory/size on
    // large multi-page exports.
    pathEl.setAttribute('d', path.toPathData(GLYPH_PATH_DECIMALS))
    pathEl.setAttribute('fill', segment.fill)
    if (usesFauxBold) {
      const strokeWidth = Math.max(0.5, segment.fontSize * FAUX_BOLD_STROKE_WIDTH_EM)
      pathEl.setAttribute('stroke', segment.fill)
      pathEl.setAttribute('stroke-width', String(strokeWidth))
      pathEl.setAttribute('stroke-linejoin', 'round')
      pathEl.setAttribute('stroke-linecap', 'round')
    }

    const segmentPaths: SVGPathElement[] = [pathEl]

    if (segment.isUnderline) {
      const textWidth = font.getAdvanceWidth(outlineText, segment.fontSize)
      if (Number.isFinite(textWidth) && textWidth > 0) {
        const underlinePath = createUnderlinePathElement({
          owner,
          startX: adjustedX,
          baselineY: segment.y,
          width: textWidth,
          font,
          fontSize: segment.fontSize,
          fill: segment.fill,
          thicknessPx: segment.underlineThicknessPx,
        })
        if (usesFauxItalic) {
          applySkewXToSvgPathElement(underlinePath, adjustedX, segment.y, FAUX_ITALIC_SKEW_DEGREES)
        }
        segmentPaths.push(underlinePath)
      }
    }

    outputElements.push(...segmentPaths)
  }

  replaceTextNodeWithPaths(textEl, outputElements)
}

function isSvgVisibilityHidden(el: Element): boolean {
  const attr = el.getAttribute('visibility')
  if (attr && attr.trim().toLowerCase() === 'hidden') return true
  return /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:;|$)/i.test(el.getAttribute('style') ?? '')
}

function isTextNodeHiddenForExport(textEl: Element): boolean {
  let current: Element | null = textEl
  while (current) {
    if (isSvgVisibilityHidden(current)) return true
    current = current.parentElement
  }
  return false
}

export async function convertSvgTextToOutlines(svgElement: SVGElement): Promise<void> {
  const textNodes = Array.from(svgElement.querySelectorAll('text'))
  if (textNodes.length === 0) return

  for (const textEl of textNodes) {
    // Outlining replaces <text style="visibility:hidden"> with visible <path>s —
    // remove hidden answer glyphs instead of converting them.
    if (isTextNodeHiddenForExport(textEl)) {
      textEl.remove()
      continue
    }
    await outlineTextElement(textEl)
  }
}
