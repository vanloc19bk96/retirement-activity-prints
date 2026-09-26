import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  WF_AREAS,
  WF_FILLER_WORDS,
  WF_FOCUSES,
  WF_LIMITS,
  WF_PRESSURE_TERMS,
  WF_SEASONAL_TERMS,
  WF_STRETCH_TERMS,
  WF_WEEKS,
  cleanWfAreas,
  firstKey,
  firstsRepeat,
  isStretch,
  normalizeFirst,
  numberWfWeeks,
  orderWfYear,
  pickWfYear,
  wfShortfall,
  wfYearProblem,
  type WfArea,
  type WfPick,
} from './content'
import { keysRepeat } from '../bucket-list/content'
import { WF_FIXTURE, WF_FIXTURE_ALL, WF_FIXTURE_IDEAS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits, areas and mixes must be the service's own. This reads the data file
 * the service loads, so a list edited on one side only fails here instead of
 * the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/weeks-of-firsts/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  focuses: Record<string, { boost: string[] }>
  areas: Record<string, { label: string; group: string; facets: string[] }>
}

const areasOf = (fixture = WF_FIXTURE): WfArea[] => cleanWfAreas(fixture.areas)

describe('weeks-of-firsts lists mirror the service', () => {
  it.each([
    ['fillerWords', WF_FILLER_WORDS],
    ['seasonalTerms', WF_SEASONAL_TERMS],
    ['pressureTerms', WF_PRESSURE_TERMS],
    ['stretchTerms', WF_STRETCH_TERMS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('keeps the same limits', () => {
    for (const [key, value] of Object.entries(WF_LIMITS)) expect(value, key).toBe(config.limits[key])
  })

  it('balances over the same areas and kinds of week', () => {
    expect(WF_AREAS).toEqual(Object.fromEntries(Object.entries(config.areas).map(([k, a]) => [k, a.group])))
  })

  it('offers exactly the mixes the service weights, boosting real areas', () => {
    expect(WF_FOCUSES.map((f) => f.value).sort()).toEqual(Object.keys(config.focuses).sort())
    for (const focus of Object.values(config.focuses)) {
      for (const key of focus.boost) expect(WF_AREAS[key], key).toBeDefined()
    }
  })

  it('can fill a year from its areas without breaking its own caps', () => {
    const areas = Object.keys(config.areas).length
    expect(areas * WF_LIMITS.areaMin).toBeLessThanOrEqual(WF_WEEKS)
    expect(areas * WF_LIMITS.areaMax).toBeGreaterThanOrEqual(WF_WEEKS)
    expect(areas).toBeGreaterThanOrEqual(WF_LIMITS.minAreas)
  })
})

describe('a weekly idea', () => {
  it('passes the whole fixture, with no two alike in meaning', () => {
    for (const idea of WF_FIXTURE_ALL) expect(normalizeFirst(idea), idea).toBe(idea)
    const keys = WF_FIXTURE_ALL.map((idea) => firstKey(idea))
    keys.forEach((key, i) => {
      for (let j = 0; j < i; j++) expect(keysRepeat(key, keys[j]!), `${WF_FIXTURE_ALL[i]} / ${WF_FIXTURE_ALL[j]}`).toBe(false)
    })
  })

  it('may run to a roomier line than a bucket-list idea', () => {
    const idea = 'Try a recipe from a cuisine you’ve never cooked before'
    expect(normalizeFirst(idea)).toBe(idea)
  })

  it.each([
    ['nothing concrete once the padding is gone', 'Visit a place you’ve never been'],
    ['vague', 'Try something different'],
    ['seasonal', 'Build a snowman in the park'],
    ['dated', 'Bake a cake for a friend’s birthday'],
    ['a holiday', 'Watch the fireworks on bonfire night'],
    ['pressure', 'Finally face your fear of heights'],
    ['pressure', 'Challenge yourself to learn Spanish'],
    ['two ideas', 'Bake bread and share it with a neighbour'],
    ['two ideas', 'Visit a gallery or a museum'],
    ['a brand', 'Take a trip to Disneyland'],
    ['alcohol', 'Try a new wine at a tasting'],
    ['assumes family', 'Take your grandchildren to the zoo'],
    ['too long', 'Ride a slow bus route all the way to the very end of the line today'],
    ['too short', 'Cook curry'],
  ])('rejects %s: %s', (_why, idea) => {
    expect(normalizeFirst(idea)).toBeNull()
  })

  it('prints the idea without the model’s own numbering', () => {
    expect(normalizeFirst('12. Cook a Thai green curry')).toBe('Cook a Thai green curry')
  })

  it('catches repeats by meaning, not by the "never tried" padding', () => {
    expect(firstsRepeat('Learn basic painting', 'Take a beginner painting lesson')).toBe(true)
    expect(firstsRepeat('Try painting for the first time', 'Take a beginner painting lesson')).toBe(true)
    expect(firstsRepeat('Try a new restaurant', 'Visit a restaurant you’ve never tried')).toBe(true)
    expect(
      firstsRepeat('Cook a dish from a cuisine you’ve never tried', 'Taste a fruit you’ve never tried'),
    ).toBe(false)
  })

  it('knows a bigger outing when it sees one', () => {
    expect(isStretch('Take a hot air balloon ride over the hills')).toBe(true)
    expect(isStretch('Go kayaking on a quiet lake')).toBe(true)
    expect(isStretch('Sprout mung beans in a glass jar')).toBe(false)
  })
})

describe('cleanWfAreas', () => {
  it('keeps every valid idea and every planned area', () => {
    const areas = areasOf()
    expect(areas.map((a) => a.key)).toEqual(Object.keys(WF_FIXTURE_IDEAS))
    expect(areas.flatMap((a) => a.items)).toHaveLength(WF_FIXTURE_ALL.length)
  })

  it('drops invalid ideas, unknown areas and repeats — across areas and against the book', () => {
    const areas = cleanWfAreas(
      [
        { key: 'kitchen', target: 3, items: [{ idea: 'Build a snowman' }, { idea: 'Cook a Thai green curry from scratch' }] },
        { key: 'tastes', target: 3, items: [{ idea: 'Cook a green Thai curry at home' }] },
        { key: 'space', target: 3, items: [{ idea: 'Watch a rocket launch from a viewing area' }] },
        { key: 'grow', target: 3, items: [{ idea: 'Grow basil from seed on a windowsill' }] },
      ],
      { avoid: ['Grow a pot of basil on a windowsill'] },
    )
    expect(areas.map((a) => [a.key, a.items.map((i) => i.idea)])).toEqual([
      ['kitchen', ['Cook a Thai green curry from scratch']],
      ['tastes', []],
      ['grow', []],
    ])
  })

  it('merges a top-up into the areas it already has, keeping their share', () => {
    const first = cleanWfAreas([{ key: 'music', target: 3, items: [{ idea: 'Pick out a simple tune on a ukulele' }] }])
    const merged = cleanWfAreas(
      [{ key: 'music', target: 2, items: [{ idea: 'Sing with a community choir for one evening' }] }],
      { keep: first },
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]!.target).toBe(3)
    expect(merged[0]!.items).toHaveLength(2)
  })

  it('reads nothing from a malformed payload', () => {
    expect(cleanWfAreas(null)).toEqual([])
    expect(cleanWfAreas([{ key: 'music', target: 99, items: [] }])).toEqual([])
    expect(cleanWfAreas([{ key: 'music', target: 3, items: 'Sing' }])).toEqual([{ key: 'music', target: 3, items: [] }])
  })
})

describe('pickWfYear', () => {
  it('takes exactly 52 weeks, each area its share', () => {
    const areas = areasOf()
    const { picks, taken } = pickWfYear(areas)
    expect(picks).toHaveLength(WF_WEEKS)
    for (const area of areas) expect(taken.get(area.key)).toBe(area.target)
  })

  it('borrows spares from other areas when one runs short, never past five weeks', () => {
    const areas = areasOf().map((a) => (a.key === 'music' ? { ...a, items: a.items.slice(0, 1) } : a))
    const { picks, taken } = pickWfYear(areas)
    expect(picks).toHaveLength(WF_WEEKS)
    expect(taken.get('music')).toBe(1)
    expect(Math.max(...taken.values())).toBeLessThanOrEqual(WF_LIMITS.areaMax)
  })

  it('passes over ideas that do not fit the page', () => {
    const { picks } = pickWfYear(areasOf(), (idea) => idea !== 'Cook a Thai green curry from scratch')
    expect(picks!.map((p) => p.idea)).not.toContain('Cook a Thai green curry from scratch')
  })

  it('caps bigger outings at four a year', () => {
    const outings = [
      'Take a hot air balloon ride over the hills',
      'Go kayaking on a calm lake',
      'Book a weekend away in a seaside town',
      'Try skiing on an indoor slope',
      'Take a flight to a city you have never seen',
      'Go camping under canvas for a night',
    ]
    const areas = areasOf().map((a) =>
      a.key === 'adventure' ? { ...a, items: [...outings.map((idea) => ({ idea, concept: '' })), ...a.items] } : a,
    )
    const { picks } = pickWfYear(areas)
    expect(picks!.filter((p) => isStretch(p.idea)).length).toBeLessThanOrEqual(WF_LIMITS.stretchMax)
  })

  it('refuses a year drawn from too few areas', () => {
    const areas = areasOf().slice(0, WF_LIMITS.minAreas - 1)
    expect(pickWfYear(areas).picks).toBeNull()
  })

  it('names the areas left short, for a top-up', () => {
    const areas = areasOf().map((a) => (a.key === 'give' || a.key === 'play' ? { ...a, items: [] } : a))
    const { taken } = pickWfYear(areas)
    expect(wfShortfall(areas, taken)).toEqual([
      { key: 'give', count: 3 },
      { key: 'play', count: 3 },
    ])
  })
})

describe('orderWfYear', () => {
  const picks = pickWfYear(areasOf()).picks!

  it('keeps every pick exactly once', () => {
    const ordered = orderWfYear(picks, 42)
    expect(new Set(ordered)).toEqual(new Set(picks))
    expect(ordered).toHaveLength(picks.length)
  })

  it('never puts an area two weeks running, and spaces each area out', () => {
    for (const seed of [1, 42, 999, 123456]) {
      const ordered = orderWfYear(picks, seed)
      ordered.forEach((pick, i) => {
        const window = ordered.slice(Math.max(0, i - 3), i).map((p) => p.area)
        expect(window, `seed ${seed} week ${i + 1}`).not.toContain(pick.area)
      })
    }
  })

  it('rarely follows one kind of week with the same kind', () => {
    const ordered = orderWfYear(picks, 42)
    const runs = ordered.filter((pick, i) => i > 0 && WF_AREAS[ordered[i - 1]!.area] === WF_AREAS[pick.area])
    expect(runs.length).toBeLessThanOrEqual(3)
  })

  it('spreads the heavier areas through the whole year', () => {
    const ordered = orderWfYear(picks, 7)
    for (const key of Object.keys(WF_AREAS)) {
      const weeks = ordered.flatMap((p, i) => (p.area === key ? [i] : []))
      if (weeks.length >= 3) expect(weeks.at(-1)! - weeks[0]!, key).toBeGreaterThanOrEqual(20)
    }
  })

  it('reads differently for a different seed', () => {
    const a = orderWfYear(picks, 1).map((p) => p.idea)
    const b = orderWfYear(picks, 2).map((p) => p.idea)
    expect(a).not.toEqual(b)
  })

  it('keeps bigger outings out of the opening weeks', () => {
    const outing: WfPick = { idea: 'Take a hot air balloon ride over the hills', concept: '', area: 'adventure' }
    const withOuting = [...picks.slice(0, -1), outing]
    for (const seed of [1, 2, 3, 4, 5]) {
      const ordered = orderWfYear(withOuting, seed)
      expect(ordered.slice(0, 4)).not.toContain(outing)
    }
  })
})

describe('wfYearProblem', () => {
  const year = numberWfWeeks(orderWfYear(pickWfYear(areasOf()).picks!, 42))

  it('passes a picked, ordered year', () => {
    expect(wfYearProblem(year)).toBeNull()
  })

  it('catches a missing week', () => {
    expect(wfYearProblem(year.slice(1))).toMatch(/51 weeks/)
  })

  it('catches numbering that skips', () => {
    const broken = year.map((w, i) => (i === 10 ? { ...w, week: 99 } : w))
    expect(wfYearProblem(broken)).toMatch(/numbered/)
  })

  it('catches a repeated idea', () => {
    const doubled = year.map((w, i) => (i === 30 ? { ...w, idea: 'Cook a green Thai curry at home' } : w))
    expect(wfYearProblem(doubled)).toMatch(/repeats/)
  })

  it('catches an idea that is not fit to print', () => {
    const bad = year.map((w, i) => (i === 5 ? { ...w, idea: 'Build a snowman' } : w))
    expect(wfYearProblem(bad)).toMatch(/Week 6/)
  })

  it('catches one area taking over', () => {
    const swamped = year.map((w, i) => (i % 8 === 0 ? { ...w, area: 'kitchen' } : w))
    expect(wfYearProblem(swamped)).toMatch(/too many weeks/)
  })

  it('catches an area two weeks running', () => {
    const [a, b] = [year[0]!, year[1]!]
    const run = [{ ...a }, { ...b, area: a.area }, ...year.slice(2)]
    expect(wfYearProblem(run)).toMatch(/in a row/)
  })
})
