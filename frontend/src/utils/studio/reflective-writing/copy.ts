import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_BODY_SIZE, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'

const MM_PER_INCH = 25.4
const PT_PER_INCH = 72

/** Millimetres → editor canvas px (logical DPI). */
export function mm(value: number): number {
  return (value * DPI) / MM_PER_INCH
}

/** Print points → editor canvas px. */
export function pt(value: number): number {
  return (value * DPI) / PT_PER_INCH
}

/** Large-print prompt size (~15pt) — senior-market accessibility. */
export const JOURNAL_PROMPT_SIZE = pt(15)

/** Comfortable prompt leading (~1.4×). */
export const JOURNAL_PROMPT_LEADING = 1.4

/** Mid of the 8–10 mm handwriting gap range. */
export const JOURNAL_LINE_GAP = mm(9)

/** Minimum air under the prompt before the first rule. */
export const JOURNAL_FIRST_LINE_MIN_GAP = mm(6)

/** Breathing room between the date line and the prompt below. */
export const JOURNAL_DATE_PROMPT_GAP = mm(12)

/** Writing-line weight — hairline floor so rules stay visible on washed displays. */
export const JOURNAL_RULE_STROKE = Math.max(STUDIO_STROKE_HAIRLINE, pt(0.75))

/** Safety / date furniture — quieter than body. */
export const JOURNAL_MUTED_SIZE = Math.max(14, STUDIO_BODY_SIZE * 0.7)

export const DATE_LINE_LABEL = 'Date: ______________'

/** Matches backend stage/theme max length. */
export const CUSTOM_THEME_TEXT_MAX = 80
