import type { StudioRng } from '../studio-rng'
import type { StroopDirection } from './direction-arrow'

export type StroopVariant = 'number' | 'direction' | 'count-word'
export type StroopCondition = 'congruent' | 'neutral' | 'incongruent'

export interface StroopItem {
  display: string
  answer: string
  condition: StroopCondition
}

const COUNTS = [2, 3, 4, 5, 6] as const
/** Word runs grow ~5 chars per repeat — more than 4 shrinks the print below legible. */
const COUNT_WORD_COUNTS = [2, 3, 4] as const
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
// ASCII, not a dingbat glyph — catalog fonts lack '■' so PDF/SVG outline export
// would show a missing-glyph fallback instead of the mark.
const NEUTRAL_GLYPH = 'X'

const DIRECTIONS: readonly StroopDirection[] = ['up', 'down', 'left', 'right']
const DIR_NEUTRAL = ['mark', 'here', 'spot', 'dot'] as const

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six'] as const
const COUNT_WORD_VALUE: Record<(typeof COUNT_WORDS)[number], number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
}
const COUNT_NEUTRAL = ['cat', 'tree', 'book', 'lamp'] as const

export function clampItemCount(raw: number): number {
  const n = Number.isFinite(raw) ? Math.round(raw) : 30
  const stepped = Math.round(n / 6) * 6
  return Math.min(60, Math.max(12, stepped))
}

export function copyFor(variant: StroopVariant): { instruction: string; example: string } {
  if (variant === 'direction') {
    return {
      instruction:
        'Name the direction the ARROW points. Ignore the word. Go fast, and time yourself',
      // Direction example is drawn with path arrows in generate (not this string).
      example: '',
    }
  }
  if (variant === 'count-word') {
    return {
      instruction:
        'Count how many times the word is printed. Ignore the word itself. Go fast, and time yourself',
      example: 'two two two answer is 3',
    }
  }
  return {
    instruction:
      'Count how many characters are in each group. Ignore what the number is. Answer as fast as you can, and time yourself',
    example: '3 3 3 3 answer is 4',
  }
}

export function buildItems(
  variant: StroopVariant,
  itemCount: number,
  rng: StudioRng,
): StroopItem[] {
  const items: StroopItem[] = []
  for (let i = 0; i < itemCount; i++) {
    items.push(buildOne(variant, 'incongruent', rng))
  }
  return items
}

export function buildOne(
  variant: StroopVariant,
  condition: StroopCondition,
  rng: StudioRng,
): StroopItem {
  if (variant === 'direction') return buildDirection(condition, rng)
  if (variant === 'count-word') return buildCountWord(condition, rng)
  return buildNumber(condition, rng)
}

function buildNumber(condition: StroopCondition, rng: StudioRng): StroopItem {
  const k = rng.pick(COUNTS)
  if (condition === 'neutral') {
    return {
      display: Array.from({ length: k }, () => NEUTRAL_GLYPH).join(' '),
      answer: String(k),
      condition,
    }
  }
  let digit = condition === 'congruent' ? k : rng.pick(DIGITS.filter((d) => d !== k))
  // Guard: incongruent must never equal the count.
  if (condition === 'incongruent' && digit === k) {
    digit = DIGITS.find((d) => d !== k) ?? 1
  }
  return {
    display: Array.from({ length: k }, () => String(digit)).join(' '),
    answer: String(k),
    condition,
  }
}

function buildDirection(condition: StroopCondition, rng: StudioRng): StroopItem {
  const arrowDir = rng.pick(DIRECTIONS)
  if (condition === 'neutral') {
    return {
      display: rng.pick(DIR_NEUTRAL),
      answer: arrowDir,
      condition,
    }
  }
  if (condition === 'congruent') {
    return { display: arrowDir, answer: arrowDir, condition }
  }
  const other = DIRECTIONS.filter((d) => d !== arrowDir)
  return {
    display: rng.pick(other),
    answer: arrowDir,
    condition,
  }
}

function buildCountWord(condition: StroopCondition, rng: StudioRng): StroopItem {
  const k = rng.pick(COUNT_WORD_COUNTS)
  if (condition === 'neutral') {
    const word = rng.pick(COUNT_NEUTRAL)
    return {
      display: Array.from({ length: k }, () => word).join(' '),
      answer: String(k),
      condition,
    }
  }
  let word: (typeof COUNT_WORDS)[number]
  if (condition === 'congruent') {
    word = COUNT_WORDS.find((w) => COUNT_WORD_VALUE[w] === k) ?? 'two'
  } else {
    const others = COUNT_WORDS.filter((w) => COUNT_WORD_VALUE[w] !== k)
    word = rng.pick(others)
  }
  return {
    display: Array.from({ length: k }, () => word).join(' '),
    answer: String(k),
    condition,
  }
}
