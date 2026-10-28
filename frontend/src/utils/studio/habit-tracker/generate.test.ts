import { beforeEach, describe, expect, it } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { isStudioHeaderTitle } from '../studio-layout'
import { clearStudioRecentContent } from '../studio-variety'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { habitTrackerTemplate } from './generate'
import {
  HT_DEFAULT_TITLE,
  HT_HABITS,
  HT_MEDS_TITLE,
  HT_NO_HABITS_MESSAGE,
  HT_TOO_MANY_HABITS_MESSAGE,
  htCustomHabitsProblem,
  htRows,
  parseHtCustomHabits,
} from './content'
import { validateHtConfig } from './config'
import { LABEL_FONT_MIN, TICK_MIN, planTracker } from './layout'

const FONT = 'PT Serif'

const base: StudioConfig = {
  ...buildDefaultConfig(habitTrackerTemplate),
  showTitle: true,
  title: HT_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
  },
  seed: 42,
  instanceId: 'kdp',
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
] as const

function run(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  resetObjectCounter()
  return habitTrackerTemplate.generate({ ...config, seed: ctx.seed }, ctx)
}

/** Every drawn mark, with groups opened up and children moved back to page coordinates. */
function leaves(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => {
    if (obj.type !== 'group' || !obj.objects) return [obj]
    const cx = obj.left + obj.width! / 2
    const cy = obj.top + obj.height! / 2
    return leaves(obj.objects.map((child) => ({ ...child, left: child.left + cx, top: child.top + cy })))
  })
}

const texts = (page: StudioPageOutput) =>
  leaves(page.objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text).replace(/[ \n]/g, ' '))
const title = (page: StudioPageOutput) => page.objects.find(isStudioHeaderTitle)?.text?.replace(/ /g, ' ')
const ticks = (page: StudioPageOutput) => leaves(page.objects).filter((o) => o.type === 'rect' && o.rx)
const glasses = (page: StudioPageOutput) => leaves(page.objects).filter((o) => o.type === 'polygon')

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(habitTrackerTemplate, { expectAnswers: false, expectSeedVariance: false })

describe('habit tracker registry', () => {
  it('is a seed-invariant keepsake with no answer key', () => {
    const def = getStudioTemplate('daily-habits-tracker')
    expect(def).toBeDefined()
    expect(def!.category).toBe('keepsake')
    expect(def!.producesAnswerKey).toBe(false)
    expect(def!.seedInvariant).toBe(true)
    expect(habitTrackerTemplate.configSchema.map((f) => f.key)).toEqual([
      'habits',
      'glasses',
      'doseTimes',
      'customHabits',
      'weekStart',
      'weeks',
      'medsPage',
    ])
  })

  it('defaults to what the customer asked for', () => {
    expect(base.habits).toEqual(['water', 'exercise', 'sleep', 'medicines', 'supplements'])
  })
})

describe('habit tracker pages', () => {
  it.each(TRIMS)('fits the default set on a %s x %s trim', (w, h) => {
    const ctx = kdpCtx(w, h)
    const pages = run(base, ctx)
    expect(pages).toHaveLength(1 + 4)
    for (const page of pages) {
      expect(page.buildFailed).toBeUndefined()
      assertObjectsInSafeMargin(leaves(page.objects), ctx)
    }
  })

  it('prints the medicines list first, then one page per week', () => {
    const pages = run({ ...base, weeks: 2 }, kdpCtx(6, 9))
    expect(pages.map(title)).toEqual([HT_MEDS_TITLE, HT_DEFAULT_TITLE, HT_DEFAULT_TITLE])
    expect(texts(pages[0]!)).toEqual(expect.arrayContaining(['Doctor', 'Pharmacy', 'Phone', 'Dose']))
    expect(texts(pages[1]!)).toEqual(expect.arrayContaining(['Week of', 'Water', 'Mon', 'Sun']))
  })

  it('leaves the medicines list out when switched off', () => {
    const pages = run({ ...base, medsPage: false, weeks: 1 }, kdpCtx(6, 9))
    expect(pages.map(title)).toEqual([HT_DEFAULT_TITLE])
  })

  it('prints no heading on any page when the title is off', () => {
    const pages = run({ ...base, title: '', weeks: 1 }, kdpCtx(6, 9))
    expect(pages.map(title)).toEqual([undefined, undefined])
  })

  it('draws a tick box per day for every check row and a glass per glass of water', () => {
    // Exercise, morning and evening medicines, supplements: four check rows.
    const pages = run({ ...base, medsPage: false, weeks: 1, glasses: 6 }, kdpCtx(6, 9))
    expect(ticks(pages[0]!)).toHaveLength(4 * 7)
    expect(glasses(pages[0]!)).toHaveLength(6 * 7)
    for (const tick of ticks(pages[0]!)) expect(tick.width).toBeGreaterThanOrEqual(TICK_MIN)
  })

  it('adds one medicine row per time of day', () => {
    const rows = htRows({ habits: ['medicines'], doseTimes: 4, custom: [] })
    expect(rows.map((r) => r.label)).toEqual([
      'Morning medicines',
      'Midday medicines',
      'Evening medicines',
      'Bedtime medicines',
    ])
  })

  it('starts the week on Sunday when asked', () => {
    const pages = run({ ...base, medsPage: false, weeks: 1, weekStart: 'sunday' }, kdpCtx(8.5, 11))
    const days = texts(pages[0]!).filter((t) => ['Sun', 'Mon', 'Sat'].includes(t))
    expect(days).toEqual(['Sun', 'Mon', 'Sat'])
  })

  it('prints the seller’s own habits as rows to tick', () => {
    const pages = run(
      { ...base, habits: [], medsPage: false, weeks: 1, customHabits: ['Call a friend', 'Read a chapter'] },
      kdpCtx(6, 9),
    )
    expect(texts(pages[0]!)).toEqual(expect.arrayContaining(['Call a friend', 'Read a chapter']))
    expect(ticks(pages[0]!)).toHaveLength(2 * 7)
  })

  it('keeps every label in large print on the smallest trim', () => {
    const all = HT_HABITS.map((h) => h.value)
    const rows = htRows({ habits: all, doseTimes: 2, custom: [] })
    const result = planTracker(kdpCtx(8.5, 11), {
      head: { title: HT_DEFAULT_TITLE, instruction: '' },
      rows,
      glasses: 8,
      weekStart: 'monday',
      font: FONT,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.labelFont).toBeGreaterThanOrEqual(LABEL_FONT_MIN)
  })

  it('says plainly when every habit will not fit a small trim', () => {
    const everything = {
      ...base,
      habits: HT_HABITS.map((h) => h.value),
      doseTimes: 4,
      customHabits: ['Call a friend', 'Read a chapter', 'Water the plants'],
    }
    const pages = run(everything, kdpCtx(5, 8))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.buildFailed).toBe(HT_TOO_MANY_HABITS_MESSAGE)
  })

  it('refuses an empty set of habits', () => {
    const pages = run({ ...base, habits: [] }, kdpCtx(6, 9))
    expect(pages[0]!.buildFailed).toBe(HT_NO_HABITS_MESSAGE)
    expect(validateHtConfig({ ...base, habits: [] })).toEqual({ message: HT_NO_HABITS_MESSAGE, field: 'habits' })
  })

  it('keeps every weekly page identical apart from object ids', () => {
    const pages = run({ ...base, medsPage: false, weeks: 3 }, kdpCtx(6, 9))
    const strip = (page: StudioPageOutput) => JSON.stringify(page.objects).replace(/"objectId":"[^"]*"/g, '')
    expect(strip(pages[1]!)).toBe(strip(pages[0]!))
    expect(strip(pages[2]!)).toBe(strip(pages[0]!))
  })
})

describe('own habits', () => {
  it('trims, deduplicates and keeps at most three', () => {
    expect(parseHtCustomHabits(['  Call  a friend ', 'call a friend', '', 'Read', 'Walk the dog', 'Garden'])).toEqual([
      'Call a friend',
      'Read',
      'Walk the dog',
    ])
  })

  it('explains a list that is too long or a habit that is too wordy', () => {
    expect(htCustomHabitsProblem(['a', 'b', 'c', 'd'])).toContain('up to 3')
    expect(htCustomHabitsProblem(['Spend twenty minutes in the garden every day'])).toContain('28 characters')
    expect(htCustomHabitsProblem(['Call a friend'])).toBeNull()
  })
})
