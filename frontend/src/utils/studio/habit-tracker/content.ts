/**
 * Everything the Daily Habits pages say, bundled and plain.
 *
 * No AI and no network: a habit tracker is a form. Its value is in being
 * easy to read and easy to tick, so the wording is a short, fixed list of
 * everyday habits (water, movement, sleep, medicines, supplements…) that the
 * seller picks from, plus up to three of their own.
 *
 * Nothing here gives health advice. The pages never print a dose, an amount
 * or a target beyond the number of glasses the seller chose; the medicines
 * list is blank columns the reader fills in with what their doctor told them.
 */

export const HT_TEMPLATE_KEY = 'daily-habits-tracker'

/** Shown in the title field; printed on every weekly page. */
export const HT_DEFAULT_TITLE = 'My Daily Habits'
/** Heading of the medicines list page, unless the page title is switched off. */
export const HT_MEDS_TITLE = 'My Medicines & Supplements'

export const HT_TOO_MANY_HABITS_MESSAGE =
  'Too many habits for this page size. Untick a few, or pick a larger page in Settings.'
export const HT_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a habit tracker. Pick a larger page in Settings.'
export const HT_NO_HABITS_MESSAGE = 'Pick at least one habit to track.'

/**
 * How a row is filled in, day by day:
 * - `check`: one large box to tick.
 * - `glasses`: a small glass to fill in for each glass of water.
 * - `write`: an empty cell to write a number in, with its unit underneath.
 */
export type HtCellKind = 'check' | 'glasses' | 'write'

export interface HtHabit {
  value: string
  /** Label on the form. */
  label: string
  /** Label printed at the start of the row. */
  row: string
  kind: HtCellKind
  /** Small unit under a write-in cell ("hrs"). */
  unit?: string
}

/** Preset habits, in the order their rows print. */
export const HT_HABITS: readonly HtHabit[] = [
  { value: 'water', label: 'Drink water (a glass to fill in for each)', row: 'Water', kind: 'glasses' },
  { value: 'exercise', label: 'Exercise or a walk', row: 'Exercise or a walk', kind: 'check' },
  { value: 'stretch', label: 'Stretching', row: 'Stretching', kind: 'check' },
  { value: 'outdoors', label: 'Time outside', row: 'Time outside', kind: 'check' },
  { value: 'fruit-veg', label: 'Fruit & vegetables', row: 'Fruit & vegetables', kind: 'check' },
  { value: 'sleep', label: 'Hours of sleep (written in)', row: 'Hours of sleep', kind: 'write', unit: 'hrs' },
  { value: 'medicines', label: 'Medicines (one row per time of day)', row: 'Medicines', kind: 'check' },
  { value: 'supplements', label: 'Vitamins & supplements', row: 'Vitamins & supplements', kind: 'check' },
  { value: 'friend', label: 'Talk with a friend or family', row: 'Talk with a friend', kind: 'check' },
  { value: 'brain', label: 'Puzzle or reading', row: 'Puzzle or reading', kind: 'check' },
]

/** What the customer asked for: water, exercise, sleep, supplements and medicines. */
export const HT_DEFAULT_HABITS: readonly string[] = ['water', 'exercise', 'sleep', 'medicines', 'supplements']

export function parseHtHabits(raw: unknown): string[] {
  const picked = new Set(Array.isArray(raw) ? raw.map(String) : HT_DEFAULT_HABITS)
  return HT_HABITS.filter((h) => picked.has(h.value)).map((h) => h.value)
}

export const HT_GLASS_COUNTS = [4, 6, 8] as const
export const HT_DEFAULT_GLASSES = 8

export function parseHtGlasses(raw: unknown): number {
  const value = Number(raw)
  return (HT_GLASS_COUNTS as readonly number[]).includes(value) ? value : HT_DEFAULT_GLASSES
}

/** Medicine rows by how many times a day they are taken. */
const DOSE_ROWS: Record<number, readonly string[]> = {
  1: ['Medicines'],
  2: ['Morning medicines', 'Evening medicines'],
  3: ['Morning medicines', 'Midday medicines', 'Evening medicines'],
  4: ['Morning medicines', 'Midday medicines', 'Evening medicines', 'Bedtime medicines'],
}
export const HT_DOSE_TIMES = [1, 2, 3, 4] as const
export const HT_DEFAULT_DOSE_TIMES = 2

export function parseHtDoseTimes(raw: unknown): number {
  const value = Number(raw)
  return (HT_DOSE_TIMES as readonly number[]).includes(value) ? value : HT_DEFAULT_DOSE_TIMES
}

export const HT_WEEK_COUNTS = [1, 2, 4, 8, 12] as const
export const HT_DEFAULT_WEEKS = 4

export function parseHtWeeks(raw: unknown): number {
  const value = Number(raw)
  return (HT_WEEK_COUNTS as readonly number[]).includes(value) ? value : HT_DEFAULT_WEEKS
}

export type HtWeekStart = 'monday' | 'sunday'

export function parseHtWeekStart(raw: unknown): HtWeekStart {
  return raw === 'sunday' ? 'sunday' : 'monday'
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** The seven days in print order. */
export function htDays(start: HtWeekStart): string[] {
  return start === 'sunday' ? [DAYS[6], ...DAYS.slice(0, 6)] : [...DAYS]
}

/** A habit of the seller's own: a few words that fit a row label. */
export const HT_CUSTOM_MAX = 3
export const HT_CUSTOM_MAX_LENGTH = 28

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The seller's own habits as printed: trimmed, deduplicated, at most three. */
export function parseHtCustomHabits(raw: unknown): string[] {
  const lines = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split('\n')
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const text = clean(line)
    const key = text.toLowerCase()
    if (!text || text.length > HT_CUSTOM_MAX_LENGTH || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length === HT_CUSTOM_MAX) break
  }
  return out
}

export function htCustomHabitsProblem(raw: unknown): string | null {
  const lines = (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split('\n')).map(clean).filter(Boolean)
  if (lines.length > HT_CUSTOM_MAX) return `Add up to ${HT_CUSTOM_MAX} habits of your own, one per line.`
  if (lines.some((line) => line.length > HT_CUSTOM_MAX_LENGTH)) {
    return `Keep each habit to ${HT_CUSTOM_MAX_LENGTH} characters or fewer, e.g. “Call a friend”.`
  }
  return null
}

/** One printed row of the weekly table. */
export interface HtRow {
  label: string
  kind: HtCellKind
  unit?: string
}

/** Every row a weekly page prints, in order. */
export function htRows(options: { habits: readonly string[]; doseTimes: number; custom: readonly string[] }): HtRow[] {
  const rows: HtRow[] = []
  for (const habit of HT_HABITS) {
    if (!options.habits.includes(habit.value)) continue
    if (habit.value === 'medicines') {
      for (const label of DOSE_ROWS[options.doseTimes] ?? DOSE_ROWS[HT_DEFAULT_DOSE_TIMES]!) {
        rows.push({ label, kind: 'check' })
      }
      continue
    }
    rows.push({ label: habit.row, kind: habit.kind, unit: habit.unit })
  }
  for (const label of options.custom) rows.push({ label, kind: 'check' })
  return rows
}

/** The how-to line, naming only the kinds of cell the page has. */
export function htInstruction(rows: readonly HtRow[]): string {
  const parts = ['Tick a box each day you do it.']
  if (rows.some((r) => r.kind === 'glasses')) parts.push('Fill in a glass for each glass of water.')
  if (rows.some((r) => r.kind === 'write')) parts.push('Write in your hours of sleep.')
  return parts.join(' ')
}

export const HT_MEDS_INSTRUCTION =
  'List every medicine, vitamin and supplement you take. Bring this page to each appointment.'

/** Column headings of the medicines list, with each column's share of the width. */
export const HT_MEDS_COLUMNS: readonly { label: string; share: number }[] = [
  { label: 'Name', share: 0.34 },
  { label: 'Dose', share: 0.16 },
  { label: 'When I take it', share: 0.24 },
  { label: 'What it is for', share: 0.26 },
]

/** Write-in lines above the medicines table: a label and its phone line. */
export const HT_MEDS_CONTACTS: readonly string[] = ['Doctor', 'Pharmacy']
export const HT_PHONE_LABEL = 'Phone'
export const HT_WEEK_OF_LABEL = 'Week of'
export const HT_NOTES_LABEL = 'Notes'
