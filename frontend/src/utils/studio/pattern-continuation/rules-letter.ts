import type { StudioRng } from '../studio-rng'
import { resolveBlankIndex } from './blank-position'
import { solveMasked, type MaskedSequence } from './families'
import type { BlankPosition, Difficulty, PatternItem } from './types'

/**
 * Letter rules. A term is a fixed-shape row of tokens — "C", "C7", "CE", "CX".
 * Each token stream is checked independently with the numeric family solver:
 * letters are lifted out of mod-26 first, so "Y, A, C, E" is treated as the
 * arithmetic run a reader sees rather than as a jump backwards.
 */

const A_CODE = 'A'.charCodeAt(0)
const ALPHABET = 26

export function toLetter(index: number): string {
  return String.fromCharCode(A_CODE + (((index % ALPHABET) + ALPHABET) % ALPHABET))
}

function fromLetter(char: string): number {
  return char.toUpperCase().charCodeAt(0) - A_CODE
}

type TokenKind = 'letter' | 'number'
interface Token {
  kind: TokenKind
  value: number
}

/** Split "C7" → [letter C, number 7]; returns null on a mixed-shape term. */
function tokenize(term: string): Token[] | null {
  const parts = term.match(/[A-Za-z]|\d+/g)
  if (!parts || parts.length === 0) return null
  return parts.map((part) =>
    /\d/.test(part)
      ? { kind: 'number' as const, value: Number(part) }
      : { kind: 'letter' as const, value: fromLetter(part) },
  )
}

/**
 * Lift a mod-26 letter stream to plain integers by taking, for every gap, the
 * representative closest to zero. Unique as long as a single step stays inside
 * ±13 — every rule below keeps steps at ±6 or less.
 */
function unwrapLetters(values: MaskedSequence): (number | null)[] {
  const out: (number | null)[] = values.map(() => null)
  let previousRaw: number | null = null
  let previousLifted = 0
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (value == null) continue
    if (previousRaw === null) {
      out[index] = value
      previousRaw = value
      previousLifted = value
      continue
    }
    let delta = (((value - previousRaw) % ALPHABET) + ALPHABET) % ALPHABET
    if (delta > ALPHABET / 2) delta -= ALPHABET
    const lifted = previousLifted + delta
    out[index] = lifted
    previousRaw = value
    previousLifted = lifted
  }
  return out
}

/** Every token stream must pin down exactly one value at `blankIndex`. */
export function isLetterItemForced(terms: readonly string[], blankIndex: number): boolean {
  const tokenized = terms.map(tokenize)
  if (tokenized.some((tokens) => tokens === null)) return false
  const rows = tokenized as Token[][]
  const width = rows[0]!.length
  if (rows.some((row) => row.length !== width)) return false
  for (let column = 0; column < width; column++) {
    const kind = rows[0]![column]!.kind
    if (rows.some((row) => row[column]!.kind !== kind)) return false

    const raw: (number | null)[] = rows.map((row, index) =>
      index === blankIndex ? null : row[column]!.value,
    )
    const stream = kind === 'letter' ? unwrapLetters(raw) : raw
    const { value } = solveMasked(stream, blankIndex)
    if (value === null) return false

    const expected = rows[blankIndex]![column]!.value
    const got = kind === 'letter' ? fromLetter(toLetter(Math.round(value))) : Math.round(value)
    if (got !== expected) return false
  }
  return true
}

export interface LetterRule {
  id: string
  minShown: number
  difficulties: readonly Difficulty[]
  generate(rng: StudioRng, difficulty: Difficulty, length: number): string[]
}

function tier<T>(difficulty: Difficulty, easy: T, medium: T, hard: T): T {
  return difficulty === 'easy' ? easy : difficulty === 'medium' ? medium : hard
}

function alphabetStep(rng: StudioRng, difficulty: Difficulty, length: number): string[] {
  const size = tier(difficulty, rng.int(1, 2), rng.int(1, 3), rng.int(2, 4))
  const step = difficulty !== 'easy' && rng.chance(0.3) ? -size : size
  const start = rng.int(0, 25)
  return Array.from({ length }, (_, i) => toLetter(start + i * step))
}

function alphabetGrowing(rng: StudioRng, difficulty: Difficulty, length: number): string[] {
  const first = rng.int(1, 2)
  const growth = rng.int(1, difficulty === 'hard' ? 2 : 1)
  const start = rng.int(0, 25)
  const out: string[] = []
  let index = start
  let step = first
  for (let i = 0; i < length; i++) {
    out.push(toLetter(index))
    index += step
    step += growth
  }
  return out
}

function letterNumber(rng: StudioRng, difficulty: Difficulty, length: number): string[] {
  const startLetter = rng.int(0, 25)
  const stepLetter = rng.int(1, difficulty === 'hard' ? 3 : 2)
  const startNumber = rng.int(1, 6)
  const stepNumber = rng.int(1, difficulty === 'hard' ? 4 : 2)
  return Array.from(
    { length },
    (_, i) => `${toLetter(startLetter + i * stepLetter)}${startNumber + i * stepNumber}`,
  )
}

function letterPair(rng: StudioRng, difficulty: Difficulty, length: number): string[] {
  const start = rng.int(0, 25)
  const gap = rng.int(1, 3)
  const step = rng.int(1, difficulty === 'hard' ? 3 : 2)
  return Array.from(
    { length },
    (_, i) => `${toLetter(start + i * step)}${toLetter(start + gap + i * step)}`,
  )
}

function mirrorPair(rng: StudioRng, _difficulty: Difficulty, length: number): string[] {
  const start = rng.int(0, 25)
  const step = rng.int(1, 3)
  return Array.from(
    { length },
    (_, i) => `${toLetter(start + i * step)}${toLetter(25 - start - i * step)}`,
  )
}

function doubledLetter(rng: StudioRng, _difficulty: Difficulty, length: number): string[] {
  const start = rng.int(0, 25)
  const step = rng.int(1, 3)
  return Array.from({ length }, (_, i) => {
    const letter = toLetter(start + i * step)
    return `${letter}${letter}`
  })
}

function interleavedLetters(rng: StudioRng, _difficulty: Difficulty, length: number): string[] {
  const startA = rng.int(0, 12)
  const startB = rng.int(13, 25)
  const stepA = rng.int(1, 3)
  const stepB = -rng.int(1, 3)
  return Array.from({ length }, (_, i) =>
    i % 2 === 0 ? toLetter(startA + (i / 2) * stepA) : toLetter(startB + ((i - 1) / 2) * stepB),
  )
}

export const LETTER_RULES: readonly LetterRule[] = [
  { id: 'alphabetStep', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: alphabetStep },
  { id: 'doubledLetter', minShown: 4, difficulties: ['easy', 'medium'], generate: doubledLetter },
  { id: 'letterPair', minShown: 4, difficulties: ['easy', 'medium', 'hard'], generate: letterPair },
  { id: 'letterNumber', minShown: 4, difficulties: ['medium', 'hard'], generate: letterNumber },
  { id: 'alphabetGrowing', minShown: 4, difficulties: ['medium', 'hard'], generate: alphabetGrowing },
  { id: 'mirrorPair', minShown: 4, difficulties: ['hard'], generate: mirrorPair },
  { id: 'interleavedLetters', minShown: 6, difficulties: ['hard'], generate: interleavedLetters },
]

/** Longest letter sequence the sheet lays out comfortably. */
const MAX_TERMS = 7

function wrapsPastZ(rule: LetterRule, terms: readonly string[]): boolean {
  // A wrap shows up as a letter stream that runs backwards between two terms
  // whose overall direction is forwards (or the mirror case).
  if (rule.id === 'interleavedLetters' || rule.id === 'mirrorPair') return false
  const codes = terms.map((term) => fromLetter(term[0]!))
  const deltas = codes.slice(1).map((code, i) => code - codes[i]!)
  const forward = deltas.filter((d) => d > 0).length
  const backward = deltas.filter((d) => d < 0).length
  return forward > 0 && backward > 0
}

export interface LetterItemOptions {
  difficulty: Difficulty
  blankPosition: BlankPosition
  /** Sequences already on this sheet, keyed by `terms.join(',')`. */
  used?: Set<string>
  /** Rules already spent on this sheet, so one rule cannot fill the page. */
  ruleUsage?: Map<string, number>
  /** Puzzles on the sheet — sets how often a single rule may repeat. */
  itemCount?: number
}

const ATTEMPTS = 64

export function pickLetterItem(options: LetterItemOptions, rng: StudioRng): PatternItem {
  const { difficulty, blankPosition, used, ruleUsage, itemCount } = options
  const rules = LETTER_RULES.filter((rule) => rule.difficulties.includes(difficulty))
  const ruleCap =
    ruleUsage && itemCount ? Math.max(1, Math.ceil(itemCount / rules.length)) : null

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rule = rng.pick(rules)
    if (ruleCap !== null && attempt < ATTEMPTS / 2) {
      if ((ruleUsage!.get(rule.id) ?? 0) >= ruleCap) continue
    }
    const probeLength = Math.min(MAX_TERMS, rule.minShown + 1)
    const wantsInterior = resolveBlankIndex(blankPosition, probeLength, rng) !== probeLength - 1
    const length = Math.min(MAX_TERMS, rule.minShown + 1 + (wantsInterior ? 1 : 0))
    const terms = rule.generate(rng, difficulty, length)
    if (new Set(terms).size < terms.length) continue

    const blankIndex = wantsInterior
      ? resolveBlankIndex('random', terms.length, rng)
      : terms.length - 1
    if (!isLetterItemForced(terms, blankIndex)) continue

    const signature = terms.join(',')
    if (used?.has(signature)) continue
    used?.add(signature)
    ruleUsage?.set(rule.id, (ruleUsage.get(rule.id) ?? 0) + 1)

    return {
      kind: 'letter',
      ruleId: rule.id,
      terms,
      answerText: terms[blankIndex],
      blankIndex,
      usesLetterWrap: wrapsPastZ(rule, terms),
    }
  }

  return fallbackLetterItem(used, rng)
}

function fallbackLetterItem(used: Set<string> | undefined, rng: StudioRng): PatternItem {
  const step = rng.int(1, 3)
  for (let start = rng.int(0, 25); start >= 0; start--) {
    const terms = Array.from({ length: 5 }, (_, i) => toLetter(start + i * step))
    const signature = terms.join(',')
    if (new Set(terms).size < terms.length) continue
    if (used?.has(signature)) continue
    used?.add(signature)
    return {
      kind: 'letter',
      ruleId: 'alphabetStep',
      terms,
      answerText: terms[terms.length - 1],
      blankIndex: terms.length - 1,
      usesLetterWrap: start + 4 * step > 25,
    }
  }
  const terms = Array.from({ length: 5 }, (_, i) => toLetter(i * step))
  return {
    kind: 'letter',
    ruleId: 'alphabetStep',
    terms,
    answerText: terms[terms.length - 1],
    blankIndex: terms.length - 1,
    usesLetterWrap: false,
  }
}
