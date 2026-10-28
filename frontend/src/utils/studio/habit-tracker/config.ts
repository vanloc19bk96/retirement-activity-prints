import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  HT_CUSTOM_MAX,
  HT_DEFAULT_DOSE_TIMES,
  HT_DEFAULT_GLASSES,
  HT_DEFAULT_HABITS,
  HT_DEFAULT_WEEKS,
  HT_DOSE_TIMES,
  HT_GLASS_COUNTS,
  HT_HABITS,
  HT_NO_HABITS_MESSAGE,
  HT_WEEK_COUNTS,
  htCustomHabitsProblem,
  htInstruction,
  htRows,
  parseHtCustomHabits,
  parseHtDoseTimes,
  parseHtGlasses,
  parseHtHabits,
  parseHtWeekStart,
} from './content'
import { htContentBox, planTracker, wrapInstruction } from './layout'

/**
 * Which habits, how often medicines are taken, and how many weeks.
 *
 * What the form deliberately does not ask:
 *
 * *Row height, tick size, type size* — all fall out of the trim at sizes an
 * older reader can use: large-print labels, ticks no smaller than a fingertip
 * mark. The weeks note reports when the habits will not fit the page.
 *
 * *Medicine names, doses or targets* — the pages never print health advice.
 * The medicines list is blank, filled in by hand with what the doctor said.
 */

const hasHabit = (config: StudioConfig, value: string) => parseHtHabits(config.habits).includes(value)

/** Plans one weekly page for the form, so a seller hears about a crowded page before generating. */
function trackerFit(config: StudioConfig, layout: StudioConfigLayoutContext | undefined): string | null {
  if (!layout) return null
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const rows = htRows({
    habits: parseHtHabits(config.habits),
    doseTimes: parseHtDoseTimes(config.doseTimes),
    custom: parseHtCustomHabits(config.customHabits),
  })
  if (rows.length === 0) return HT_NO_HABITS_MESSAGE
  const instruction =
    config.showInstructions === false ? '' : wrapInstruction(htInstruction(rows), htContentBox(layout).width, font)
  const result = planTracker(layout, {
    head: { title: String(config.title ?? '').trim(), instruction },
    rows,
    glasses: parseHtGlasses(config.glasses),
    weekStart: parseHtWeekStart(config.weekStart),
    font,
  })
  return result.ok ? null : result.message
}

export const HT_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'habits',
    label: 'Habits to track',
    type: 'multiSelect',
    default: [...HT_DEFAULT_HABITS],
    options: HT_HABITS.map((habit) => ({ label: habit.label, value: habit.value })),
    help: 'Each habit is one row, with a box to tick for every day of the week.',
    warningWhen: (config, layout) => trackerFit(config, layout),
  },
  {
    key: 'glasses',
    label: 'Glasses of water a day',
    type: 'select',
    default: HT_DEFAULT_GLASSES,
    options: HT_GLASS_COUNTS.map((n) => ({ label: `${n} glasses`, value: n })),
    help: 'How many glasses to fill in each day. Pick what the reader’s doctor recommends.',
    visibleWhen: (config) => hasHabit(config, 'water'),
  },
  {
    key: 'doseTimes',
    label: 'Medicines taken',
    type: 'select',
    default: HT_DEFAULT_DOSE_TIMES,
    options: HT_DOSE_TIMES.map((n) => ({
      label: n === 1 ? 'Once a day' : n === 2 ? 'Twice a day (morning, evening)' : n === 3 ? 'Three times (morning, midday, evening)' : 'Four times (adds bedtime)',
      value: n,
    })),
    help: 'One row for each time of day, so a missed dose is easy to spot.',
    visibleWhen: (config) => hasHabit(config, 'medicines'),
  },
  {
    key: 'customHabits',
    label: 'Your own habits (optional)',
    type: 'wordList',
    default: [],
    placeholder: 'Call a friend\nRead a chapter',
    help: `Up to ${HT_CUSTOM_MAX}, one per line, each printed as its own row to tick.`,
  },
  {
    key: 'weekStart',
    label: 'Week starts on',
    type: 'select',
    default: 'monday',
    options: [
      { label: 'Monday', value: 'monday' },
      { label: 'Sunday', value: 'sunday' },
    ],
  },
  {
    key: 'weeks',
    label: 'Weeks',
    type: 'select',
    default: HT_DEFAULT_WEEKS,
    options: HT_WEEK_COUNTS.map((n) => ({ label: n === 1 ? '1 week' : `${n} weeks`, value: n })),
    help: 'One page per week, each with a “Week of” line to date by hand.',
  },
  {
    key: 'medsPage',
    label: 'Add a medicines list page',
    type: 'toggle',
    default: true,
    help: 'A blank table for each medicine and supplement (dose, when, what it is for), with doctor and pharmacy phone lines. Printed before the weekly pages.',
  },
]

export function validateHtConfig(config: StudioConfig): StudioConfigValidationError | null {
  const custom = htCustomHabitsProblem(config.customHabits)
  if (custom) return { message: custom, field: 'customHabits' }
  if (parseHtHabits(config.habits).length === 0 && parseHtCustomHabits(config.customHabits).length === 0) {
    return { message: HT_NO_HABITS_MESSAGE, field: 'habits' }
  }
  return null
}
