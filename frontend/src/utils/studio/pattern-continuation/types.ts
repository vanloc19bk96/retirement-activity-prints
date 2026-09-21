export type Difficulty = 'easy' | 'medium' | 'hard'
export type Mode = 'number' | 'letter' | 'mixed'
export type BlankPosition = 'end' | 'random' | 'mixed' | 'middle'
export type ItemKind = 'number' | 'letter'

/** Skill groups behind the "Pattern types" picker. */
export type PatternGroup =
  | 'add'
  | 'multiply'
  | 'figurate'
  | 'growing'
  | 'recursive'
  | 'interleaved'
  | 'special'

export const PATTERN_GROUPS: readonly { value: PatternGroup; label: string }[] = [
  { value: 'add', label: 'Adding & subtracting' },
  { value: 'multiply', label: 'Multiplying & dividing' },
  { value: 'growing', label: 'Growing & shrinking steps' },
  { value: 'figurate', label: 'Squares, cubes & triangles' },
  { value: 'recursive', label: 'Build-on-previous (Fibonacci)' },
  { value: 'interleaved', label: 'Two alternating series' },
  { value: 'special', label: 'Prime numbers' },
]

export interface PatternItem {
  kind: ItemKind
  /** Rule that produced the sequence — kept for tests and analytics. */
  ruleId: string
  /** Full sequence including the answer slot. */
  terms: string[]
  answerText?: string
  blankIndex: number
  /** True when letter arithmetic wrapped past Z→A. */
  usesLetterWrap?: boolean
}
