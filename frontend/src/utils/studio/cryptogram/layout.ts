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

const LINE_RATIO = 2.5
const WORD_GAP_RATIO = 0.55
const MIN_FONT = 9

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
 * Largest font whose wrapped slot rows still fit the band. Shrinking the type is
 * the only lever — a cryptogram cannot drop letters to make room.
 */
export function layoutCryptogram(options: {
  words: readonly string[]
  bandWidth: number
  bandHeight: number
  slotEm: number
  maxFont: number
}): CryptogramLayout {
  const { words, bandWidth, bandHeight, slotEm, maxFont } = options
  let fallback: CryptogramLayout | null = null

  for (let fontSize = Math.floor(maxFont); fontSize >= MIN_FONT; fontSize--) {
    const slotW = fontSize * slotEm
    const wordGap = slotW * WORD_GAP_RATIO
    const lineH = fontSize * LINE_RATIO
    const lines = wrapWords({ words, slotW, wordGap, bandWidth })
    const layout: CryptogramLayout = {
      fontSize,
      slotW,
      wordGap,
      lineH,
      lines,
      height: lines.length * lineH,
    }
    fallback ??= layout
    if (layout.height <= bandHeight) return layout
  }

  // Only reachable when the band is shorter than one row at the minimum size.
  return fallback ?? emptyLayout(MIN_FONT, slotEm)
}

function emptyLayout(fontSize: number, slotEm: number): CryptogramLayout {
  const slotW = fontSize * slotEm
  return {
    fontSize,
    slotW,
    wordGap: slotW * WORD_GAP_RATIO,
    lineH: fontSize * LINE_RATIO,
    lines: [],
    height: 0,
  }
}
