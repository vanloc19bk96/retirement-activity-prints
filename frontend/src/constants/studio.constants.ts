import type { StudioConfigField } from '@/types/studio-template.types'

export const STUDIO_INK = '#000000'
export const STUDIO_INK_MUTED = '#6B7280'
export const STUDIO_RULE = '#111827'
export const STUDIO_RULE_LIGHT = '#D1D5DB'
/** Mid gray for cell grids — darker than RULE_LIGHT so lines stay visible on washed displays. */
export const STUDIO_RULE_MEDIUM = '#9CA3AF'
export const STUDIO_PAPER = '#FFFFFF'
export const STUDIO_ANSWER_INK = '#1D4ED8'
/** Monochrome answer marks — print-safe, not blue. */
export const STUDIO_ANSWER_INK_MONO = STUDIO_INK

/**
 * B&W / print-first templates: answer-key reveal must use black ink, not blue.
 * Add new monochrome worksheets here when they produce an answer key.
 */
export const STUDIO_ANSWER_INK_MONO_TEMPLATES = new Set([
  'sudoku',
  'word-search',
  'crossword',
  'anagram-sheet',
  'retirement-anagram',
  'missing-vowels',
  'decade-trivia',
  'cryptogram',
  'maze',
  'word-ladder',
  // Procedural worksheets — black-and-white interior by design.
  'word-fit',
])

export const STUDIO_STROKE_HAIRLINE = 1.5
export const STUDIO_STROKE_NORMAL = 2
export const STUDIO_STROKE_BOLD = 3

export const STUDIO_TITLE_SIZE = 32
export const STUDIO_INSTRUCTION_SIZE = 20
export const STUDIO_BODY_SIZE = 24

/** Keep header text clear of the safe-area top edge. */
export const STUDIO_TITLE_TOP_INSET = 24
export const STUDIO_TITLE_GAP = 24
export const STUDIO_INSTRUCTION_GAP = 32
export const STUDIO_SECTION_GAP = 40
/** Extra left/right inset inside the safe area — shared by all studio games. */
export const STUDIO_CONTENT_SAFE_INSET_X = 28

export const STUDIO_DEFAULT_FONT = 'PT Serif'
/**
 * Lining figures for digit grids / sequences.
 * PT Serif oldstyle digits sit high/low and look uneven until Fabric edit remasure.
 */
export const STUDIO_DIGIT_FONT = 'Inter'

/** Default Page title prefix — paired with the next game ordinal. */
export const STUDIO_GAME_TITLE_PREFIX = 'Game'

/** Answer-key / solution page title prefix — “Solution Game N”. */
export const STUDIO_SOLUTION_TITLE_PREFIX = 'Solution'

/**
 * UI-only — generators must use createRng(ctx.seed), never this.
 * Full 32-bit range (~4.29e9) so thousands of users rarely share a seed.
 */
export function randomStudioSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return (buf[0]! >>> 0) || 1
  }
  return (Math.floor(Math.random() * 0x1_0000_0000) >>> 0) || 1
}

/** Prefer a fresh seed; skip any already used in the current bulk batch. */
export function allocateStudioSeed(usedSeeds?: Set<number>): number {
  for (let attempt = 0; attempt < 32; attempt++) {
    const seed = randomStudioSeed()
    if (!usedSeeds?.has(seed)) {
      usedSeeds?.add(seed)
      return seed
    }
  }
  let seed = randomStudioSeed()
  while (usedSeeds?.has(seed)) {
    seed = (seed + 1) >>> 0 || 1
  }
  usedSeeds?.add(seed)
  return seed
}

export const STUDIO_COMMON_FIELDS: StudioConfigField[] = [
  {
    key: 'showTitle',
    label: 'Page title',
    type: 'toggle',
    default: true,
  },
  {
    key: 'title',
    label: 'Title text',
    type: 'text',
    default: '',
    help: 'Leave blank and pages are numbered for you — Game 1, Game 2… Answer pages match, as “Solution Game 1”.',
    visibleWhen: (config) => config.showTitle === true,
  },
  {
    key: 'showInstructions',
    label: 'Show instructions',
    type: 'toggle',
    default: true,
  },
]
