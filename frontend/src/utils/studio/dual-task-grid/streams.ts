import type { StudioRng } from '../studio-rng'

export type StreamType =
  | 'running-sum'
  | 'running-count'
  | 'updown-track'
  | 'parity-track'
  | 'alt-sign-sum'
  | 'threshold-count'
  | 'vowel-count'

export type Difficulty = 'easy' | 'standard' | 'hard'

export interface DualItem {
  stream: 'A' | 'B'
  token: string
}

export interface StreamResult {
  tokens: string[]
  label: string
  answer: string
  streamType: StreamType
  /** Target symbol for running-count (used by answer recompute). */
  countTarget?: string
  /** Numeric cutoff for threshold-count (used by answer recompute). */
  threshold?: number
}

export interface DualTaskSheet {
  items: DualItem[]
  taskALabel: string
  taskBLabel: string
  answerA: string
  answerB: string
  streamA: StreamType
  streamB: StreamType
  countTargetA?: string
  countTargetB?: string
  thresholdA?: number
  thresholdB?: number
}

// Token identities for the "count a symbol" task. These are stable string ids
// (not raw glyph characters) — draw.ts renders them as Phosphor duotone icons so
// PDF/SVG outline export matches the editor (catalog fonts lack dingbat glyphs).
const COUNT_TARGET = 'triangle-up'
const COUNT_DISTRACTORS = ['circle', 'square', 'diamond'] as const
const COUNT_DISTRACTORS_HARD = ['triangle-right', 'triangle-down', 'triangle-left', 'circle'] as const
const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const
const VOWEL_SET = new Set<string>(VOWELS)
/** Consonant distractors — wider pool on harder sheets. */
const CONSONANTS_BY_DIFFICULTY: Record<Difficulty, readonly string[]> = {
  easy: ['B', 'C', 'D'],
  standard: ['B', 'C', 'D', 'F', 'G', 'H'],
  hard: ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
}
const THRESHOLD_DEFAULT = 10
const THRESHOLD_RANGES: Record<Difficulty, { min: number; max: number; threshold: number }> = {
  easy: { min: 1, max: 9, threshold: 5 },
  standard: { min: 1, max: 20, threshold: 10 },
  hard: { min: 10, max: 39, threshold: 25 },
}

const ALL_STREAMS: StreamType[] = [
  'running-sum',
  'running-count',
  'updown-track',
  'parity-track',
  'alt-sign-sum',
  'threshold-count',
  'vowel-count',
]

export function parseStreamType(raw: unknown, fallback: StreamType): StreamType {
  // Legacy saved configs used consecutive-letter repeats — map to vowel tally.
  if (raw === 'repeat-count') return 'vowel-count'
  if (
    raw === 'running-sum' ||
    raw === 'running-count' ||
    raw === 'updown-track' ||
    raw === 'parity-track' ||
    raw === 'alt-sign-sum' ||
    raw === 'threshold-count' ||
    raw === 'vowel-count'
  ) {
    return raw
  }
  return fallback
}

export function parseDifficulty(raw: unknown): Difficulty {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'standard'
}

export function itemsPerRowFor(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 8
  if (difficulty === 'hard') return 12
  return 10
}

/** Full-row totals — load scales with difficulty (easy 3×8, standard 4×10, hard 5×12). */
const ITEM_COUNT_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 24,
  standard: 40,
  hard: 60,
}

export function itemCountForDifficulty(difficulty: Difficulty): number {
  return ITEM_COUNT_BY_DIFFICULTY[difficulty]
}

/** A/B share of the grid — both tasks appear, counts vary. */
function splitStreamCounts(totalItems: number, rng: StudioRng): {
  countA: number
  countB: number
} {
  if (totalItems < 2) {
    throw new Error('dual-task-grid: item count must be ≥ 2')
  }
  const minShare = Math.max(1, Math.floor(totalItems * 0.35))
  const maxShare = totalItems - minShare
  const countA = rng.int(minShare, maxShare)
  return { countA, countB: totalItems - countA }
}

/** Pick a different stream (defaults / tests only — UI must not silently swap). */
export function fallbackDifferent(stream: StreamType): StreamType {
  const pick = ALL_STREAMS.find((s) => s !== stream)
  return pick ?? 'running-count'
}

export const SAME_TASK_ERROR =
  'Task A and Task B must be different. Switching between unlike tasks is the exercise.'

export function validateDualTaskConfig(config: {
  taskA?: unknown
  taskB?: unknown
}): { message: string; field: 'taskB' } | null {
  const taskA = parseStreamType(config.taskA, 'running-sum')
  const taskB = parseStreamType(config.taskB, 'running-count')
  if (taskA === taskB) return { message: SAME_TASK_ERROR, field: 'taskB' }
  return null
}

export function answerVerb(label: string): string {
  const lower = label.toLowerCase()
  if (lower.includes('count')) return 'count'
  if (lower.includes('odd') || lower.includes('even')) return 'flag'
  return 'total'
}

function makeRunningSum(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const tokens: string[] = []
  let sum = 0
  for (let i = 0; i < count; i++) {
    const n =
      difficulty === 'hard'
        ? rng.int(10, 29)
        : difficulty === 'easy'
          ? rng.int(1, 5)
          : rng.int(1, 9)
    tokens.push(String(n))
    sum += n
  }
  return {
    tokens,
    label: 'add the numbers',
    answer: String(sum),
    streamType: 'running-sum',
  }
}

function makeRunningCount(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const distractors =
    difficulty === 'hard' ? COUNT_DISTRACTORS_HARD : COUNT_DISTRACTORS
  // ~40–55% targets so the tally is non-trivial but not sparse
  const targetRate = difficulty === 'easy' ? 0.45 : difficulty === 'hard' ? 0.4 : 0.5
  const tokens: string[] = []
  let tally = 0
  for (let i = 0; i < count; i++) {
    if (rng.chance(targetRate)) {
      tokens.push(COUNT_TARGET)
      tally++
    } else {
      tokens.push(rng.pick(distractors))
    }
  }
  // Guarantee at least one target so the answer is meaningful
  if (tally === 0 && count > 0) {
    tokens[0] = COUNT_TARGET
    tally = 1
  }
  return {
    tokens,
    label: 'count the triangles',
    answer: String(tally),
    streamType: 'running-count',
    countTarget: COUNT_TARGET,
  }
}

function makeUpdownTrack(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const tokens: string[] = []
  let value = 0
  // Easy: mostly ups so the sign stays positive and easier to track
  const upRate = difficulty === 'easy' ? 0.65 : 0.5
  for (let i = 0; i < count; i++) {
    if (rng.chance(upRate)) {
      tokens.push('↑')
      value += 1
    } else {
      tokens.push('↓')
      value -= 1
    }
  }
  return {
    tokens,
    label: 'track up/down (up = +1, down = −1)',
    answer: String(value),
    streamType: 'updown-track',
  }
}

function makeAltSignSum(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const tokens: string[] = []
  let total = 0
  for (let i = 0; i < count; i++) {
    const n =
      difficulty === 'hard'
        ? rng.int(10, 29)
        : difficulty === 'easy'
          ? rng.int(1, 5)
          : rng.int(1, 9)
    tokens.push(String(n))
    total += i % 2 === 0 ? n : -n
  }
  return {
    tokens,
    label: 'alternately add/subtract (+, −, +, −…)',
    answer: String(total),
    streamType: 'alt-sign-sum',
  }
}

function makeThresholdCount(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const { min, max, threshold } = THRESHOLD_RANGES[difficulty]
  const tokens: string[] = []
  let tally = 0
  for (let i = 0; i < count; i++) {
    const n = rng.int(min, max)
    tokens.push(String(n))
    if (n > threshold) tally++
  }
  return {
    tokens,
    label: `count numbers over ${threshold}`,
    answer: String(tally),
    streamType: 'threshold-count',
    threshold,
  }
}

function makeVowelCount(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const consonants = CONSONANTS_BY_DIFFICULTY[difficulty]
  // Easy: more vowels so the tally stays light to track under dual load.
  const vowelRate = difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 0.35 : 0.45
  const tokens: string[] = []
  let tally = 0
  for (let i = 0; i < count; i++) {
    if (rng.chance(vowelRate)) {
      tokens.push(rng.pick(VOWELS))
      tally++
    } else {
      tokens.push(rng.pick(consonants))
    }
  }
  if (tally === 0 && count > 0) {
    tokens[0] = rng.pick(VOWELS)
    tally = 1
  }
  return {
    tokens,
    label: 'count the vowels (A, E, I, O, U)',
    answer: String(tally),
    streamType: 'vowel-count',
  }
}

function makeParityTrack(count: number, difficulty: Difficulty, rng: StudioRng): StreamResult {
  const tokens: string[] = []
  // Start even; flip on every odd number
  let isOdd = false
  for (let i = 0; i < count; i++) {
    const n =
      difficulty === 'hard'
        ? rng.int(10, 39)
        : difficulty === 'easy'
          ? rng.int(1, 9)
          : rng.int(1, 20)
    tokens.push(String(n))
    if (n % 2 !== 0) isOdd = !isOdd
  }
  return {
    tokens,
    label: 'track odd/even (flip on each odd)',
    answer: isOdd ? 'odd' : 'even',
    streamType: 'parity-track',
  }
}

export function makeStream(
  streamType: StreamType,
  count: number,
  difficulty: Difficulty,
  rng: StudioRng,
): StreamResult {
  if (count < 1) {
    throw new Error('dual-task-grid: stream count must be ≥ 1')
  }
  switch (streamType) {
    case 'running-sum':
      return makeRunningSum(count, difficulty, rng)
    case 'running-count':
      return makeRunningCount(count, difficulty, rng)
    case 'updown-track':
      return makeUpdownTrack(count, difficulty, rng)
    case 'parity-track':
      return makeParityTrack(count, difficulty, rng)
    case 'alt-sign-sum':
      return makeAltSignSum(count, difficulty, rng)
    case 'threshold-count':
      return makeThresholdCount(count, difficulty, rng)
    case 'vowel-count':
      return makeVowelCount(count, difficulty, rng)
  }
}

export function buildSheet(
  streamA: StreamType,
  streamB: StreamType,
  totalItems: number,
  difficulty: Difficulty,
  rng: StudioRng,
): DualTaskSheet {
  const { countA, countB } = splitStreamCounts(totalItems, rng)
  const a = makeStream(streamA, countA, difficulty, rng)
  const b = makeStream(streamB, countB, difficulty, rng)

  const slots: Array<'A' | 'B'> = [
    ...Array<'A'>(countA).fill('A'),
    ...Array<'B'>(countB).fill('B'),
  ]
  const order = rng.shuffle(slots)

  let indexA = 0
  let indexB = 0
  const items: DualItem[] = order.map((stream) => {
    if (stream === 'A') {
      const token = a.tokens[indexA]!
      indexA += 1
      return { stream: 'A', token }
    }
    const token = b.tokens[indexB]!
    indexB += 1
    return { stream: 'B', token }
  })

  return {
    items,
    taskALabel: a.label,
    taskBLabel: b.label,
    answerA: a.answer,
    answerB: b.answer,
    streamA,
    streamB,
    countTargetA: a.countTarget,
    countTargetB: b.countTarget,
    thresholdA: a.threshold,
    thresholdB: b.threshold,
  }
}

/** Recompute a stream answer from printed tokens — independent of generator state. */
export function recomputeAnswer(
  streamType: StreamType,
  tokens: string[],
  countTarget = COUNT_TARGET,
  threshold = THRESHOLD_DEFAULT,
): string {
  switch (streamType) {
    case 'running-sum': {
      let sum = 0
      for (const t of tokens) sum += Number(t)
      return String(sum)
    }
    case 'running-count': {
      let n = 0
      for (const t of tokens) if (t === countTarget) n++
      return String(n)
    }
    case 'updown-track': {
      let value = 0
      for (const t of tokens) {
        if (t === '↑') value += 1
        else if (t === '↓') value -= 1
      }
      return String(value)
    }
    case 'parity-track': {
      let isOdd = false
      for (const t of tokens) {
        if (Number(t) % 2 !== 0) isOdd = !isOdd
      }
      return isOdd ? 'odd' : 'even'
    }
    case 'alt-sign-sum': {
      let total = 0
      tokens.forEach((t, i) => {
        total += i % 2 === 0 ? Number(t) : -Number(t)
      })
      return String(total)
    }
    case 'threshold-count': {
      let n = 0
      for (const t of tokens) if (Number(t) > threshold) n++
      return String(n)
    }
    case 'vowel-count': {
      let n = 0
      for (const t of tokens) if (VOWEL_SET.has(t)) n++
      return String(n)
    }
  }
}
