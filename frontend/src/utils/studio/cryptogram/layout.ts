/** Slot geometry for one cryptogram, fitted to the band it has to live in. */
export interface CryptogramLayout {
  fontSize: number
  slotW: number
  wordGap: number
  lineH: number
  /** Words grouped per printed line; a word never breaks across lines. */
  lines: string[][]
  height: number
}

export const CRYPTOGRAM_INDEX_W = 24
export const CRYPTOGRAM_BAND_GUTTER = 18

const LINE_RATIO = 2.5
const WORD_GAP_RATIO = 0.55

export function wrapWords(options: {
  words: readonly string[]
  slotW: number
  wordGap: number
  bandWidth: number
}): string[][] {
  const { words, slotW, wordGap, bandWidth } = options
  const lines: string[][] = []
  let current: string[] = []
  let currentWidth = 0

  for (const word of words) {
    const wordWidth = word.length * slotW
    const withGap = current.length === 0 ? wordWidth : currentWidth + wordGap + wordWidth
    if (current.length > 0 && withGap > bandWidth) {
      lines.push(current)
      current = [word]
      currentWidth = wordWidth
      continue
    }
    current.push(word)
    currentWidth = withGap
  }
  if (current.length > 0) lines.push(current)
  return lines
}

export function lineWidth(options: {
  words: readonly string[]
  slotW: number
  wordGap: number
}): number {
  const { words, slotW, wordGap } = options
  const letters = words.reduce((total, word) => total + word.length, 0)
  return letters * slotW + wordGap * Math.max(0, words.length - 1)
}

/**
 * Largest font whose wrapped slot rows still fit the band.
 * Returns null when even minFont would split a word or overflow.
 */
export function layoutCryptogram(options: {
  words: readonly string[]
  bandWidth: number
  bandHeight: number
  slotEm: number
  minFont: number
  maxFont: number
}): CryptogramLayout | null {
  const { words, bandWidth, bandHeight, slotEm, minFont, maxFont } = options
  if (words.length === 0 || bandWidth <= 0 || bandHeight <= 0) return null

  const floor = Math.max(1, Math.floor(minFont))
  const ceiling = Math.max(floor, Math.floor(maxFont))

  for (let fontSize = ceiling; fontSize >= floor; fontSize--) {
    const slotW = fontSize * slotEm
    const wordGap = slotW * WORD_GAP_RATIO
    const lineH = fontSize * LINE_RATIO
    const lines = wrapWords({ words, slotW, wordGap, bandWidth })
    const overflow = lines.some(
      (line) => lineWidth({ words: line, slotW, wordGap }) > bandWidth + 0.5,
    )
    if (overflow) continue
    const height = lines.length * lineH
    if (height > bandHeight) continue
    return { fontSize, slotW, wordGap, lineH, lines, height }
  }

  return null
}

/** Largest prefix of `sayings` that still fits the field at minFont. */
export function countFittingSayings(options: {
  sayings: readonly string[]
  bandWidth: number
  fieldHeight: number
  slotEm: number
  minFont: number
  maxFont: number
  bandGutter: number
}): number {
  const { sayings, bandWidth, fieldHeight, slotEm, minFont, maxFont, bandGutter } = options
  for (let n = sayings.length; n >= 1; n--) {
    const gutters = bandGutter * (n - 1)
    const bandHeight = Math.max(0, (fieldHeight - gutters) / n)
    const allFit = sayings.slice(0, n).every((saying) => {
      const layout = layoutCryptogram({
        words: saying.split(' ').filter(Boolean),
        bandWidth,
        bandHeight,
        slotEm,
        minFont,
        maxFont,
      })
      return layout != null
    })
    if (allFit) return n
  }
  return 0
}
