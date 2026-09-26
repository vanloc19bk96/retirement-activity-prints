import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  RD_AFTERNOON_BANNED,
  RD_ANY_SIDE_BANNED,
  RD_EXCLUSIVE_TERMS,
  RD_FOCUSES,
  RD_KINDS,
  RD_LIMITS,
  RD_MORNING_BANNED,
  RD_SOFT_WORDS,
  activitiesClash,
  activitiesRepeat,
  activityKey,
  buildRdTable,
  cleanRdPools,
  normalizeActivity,
  parseRdPayload,
  pickRdSide,
  rdTableProblem,
  sideCanFill,
  type RdActivity,
} from './content'
import { RD_FIXTURE, RD_FIXTURE_AFTERNOON, RD_FIXTURE_MORNING } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits, kinds and mixes must be the service's own. This reads the data file
 * the service loads, so a list edited on one side only fails here instead of
 * the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/roll-a-day/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  kinds: Record<string, unknown>
  focuses: Record<string, unknown>
}

const pools = () => cleanRdPools(parseRdPayload(RD_FIXTURE))
const always = () => true

describe('roll-a-day lists mirror the service', () => {
  it.each([
    ['anySideBanned', RD_ANY_SIDE_BANNED],
    ['morningBanned', RD_MORNING_BANNED],
    ['afternoonBanned', RD_AFTERNOON_BANNED],
    ['exclusiveTerms', RD_EXCLUSIVE_TERMS],
    ['softWords', RD_SOFT_WORDS],
  ])('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('shares limits, kinds and mixes', () => {
    for (const [key, value] of Object.entries(RD_LIMITS)) expect(config.limits[key]).toBe(value)
    expect(Object.keys(config.kinds)).toEqual([...RD_KINDS])
    expect(RD_FOCUSES.map((focus) => focus.value)).toEqual(Object.keys(config.focuses))
  })
})

describe('roll-a-day activity gates', () => {
  it('passes the fixture as written', () => {
    for (const item of RD_FIXTURE_MORNING) expect(normalizeActivity(item.activity, 'morning')).toBe(item.activity)
    for (const item of RD_FIXTURE_AFTERNOON) {
      expect(normalizeActivity(item.activity, 'afternoon')).toBe(item.activity)
    }
  })

  it.each([
    'Meet a friend for lunch',
    'Take a road trip to the coast',
    'Spend all day at the museum',
    'Finish the painting you started',
    'Watch the sunset from a bench',
    'Go for a long run by the river',
    'Drive to a country park',
    'Play a round of golf',
    'Try a new hobby',
    'Do something fun',
    'Enjoy retirement',
    'Visit a museum or a gallery',
    'Bake bread and share it',
    'Take a walk with your grandchildren',
    'Sip wine on the patio',
    'Browse the shelves at a secondhand bookshop',
  ])('refuses “%s” on both sides', (text) => {
    expect(normalizeActivity(text, 'morning')).toBeNull()
    expect(normalizeActivity(text, 'afternoon')).toBeNull()
  })

  it('keeps each half to its own time of day', () => {
    expect(normalizeActivity('Watch the sunrise from a bench', 'morning')).not.toBeNull()
    expect(normalizeActivity('Watch the sunrise from a bench', 'afternoon')).toBeNull()
    expect(normalizeActivity('Nap in a sunny armchair', 'afternoon')).not.toBeNull()
    expect(normalizeActivity('Nap in a sunny armchair', 'morning')).toBeNull()
  })

  it('treats any shared word of substance as a clash, but not who or where', () => {
    const walk = activityKey('Take a slow walk and grab a coffee')
    expect(activitiesClash(walk, activityKey('Stroll along the river path'))).toBe(true)
    expect(activitiesClash(walk, activityKey('Sip a coffee on a bench'))).toBe(true)
    const call = activityKey('Call a friend for a long catch-up')
    expect(activitiesClash(call, activityKey('Play cards with a friend at home'))).toBe(false)
  })

  it('treats the same activity in other words as a repeat across pages', () => {
    const scones = activityKey('Bake a small batch of scones')
    expect(activitiesRepeat(scones, activityKey('Bake a small tray of scones'))).toBe(true)
    expect(activitiesRepeat(scones, activityKey('Make some fresh scones'))).toBe(true)
    expect(activitiesRepeat(scones, activityKey('Bake a loaf of banana bread'))).toBe(false)
  })
})

describe('roll-a-day pools and tables', () => {
  it('keeps the whole fixture, with kinds', () => {
    const { morning, afternoon } = pools()
    expect(morning.map((item) => item.activity)).toEqual(RD_FIXTURE_MORNING.map((item) => item.activity))
    expect(afternoon.map((item) => item.activity)).toEqual(RD_FIXTURE_AFTERNOON.map((item) => item.activity))
    expect(sideCanFill(morning) && sideCanFill(afternoon)).toBe(true)
  })

  it('checks the reply as one set, each side’s first briefs winning a clash', () => {
    const cleaned = cleanRdPools({
      morning: [
        { activity: 'Take a slow walk and grab a coffee', concept: 'coffee stroll', kind: 'move' },
        { activity: 'Stroll along the river path', concept: 'river stroll', kind: 'move' },
      ],
      afternoon: [
        { activity: 'Sip a coffee at a new cafe', concept: 'cafe visit', kind: 'outing' },
        { activity: 'Bake a small batch of scones', concept: 'scone baking', kind: 'make' },
      ],
    })
    expect(cleaned.morning.map((item) => item.activity)).toEqual(['Take a slow walk and grab a coffee'])
    expect(cleaned.afternoon.map((item) => item.activity)).toEqual(['Bake a small batch of scones'])
  })

  it('drops malformed items, unknown kinds and what the book already prints', () => {
    const cleaned = cleanRdPools(
      {
        morning: [
          null,
          'Sketch the view from a window',
          { activity: 'Sketch the view from a window', kind: 'mystery' },
          { activity: 'Repot a leggy houseplant', concept: 'repotting', kind: 'home' },
        ],
        afternoon: [{ activity: 'Bake a small batch of scones', concept: 'scone baking', kind: 'make' }],
      },
      { avoid: ['Bake a small tray of scones'] },
    )
    expect(cleaned.morning.map((item) => item.activity)).toEqual(['Repot a leggy houseplant'])
    expect(cleaned.afternoon).toEqual([])
  })

  it('fills six faces per side with at least five kinds, clashing with nothing', () => {
    const table = buildRdTable(pools(), always)!
    expect(table.morning.map((entry) => entry.face)).toEqual([1, 2, 3, 4, 5, 6])
    expect(table.afternoon.map((entry) => entry.face)).toEqual([1, 2, 3, 4, 5, 6])
    for (const side of [table.morning, table.afternoon]) {
      expect(new Set(side.map((entry) => entry.kind)).size).toBeGreaterThanOrEqual(5)
    }
    expect(rdTableProblem(table)).toBeNull()
  })

  it('passes over an activity that does not fit, for a spare', () => {
    const skip = 'Take a slow walk and grab a coffee'
    const table = buildRdTable(pools(), (activity) => activity !== skip)!
    expect(table.morning.map((entry) => entry.activity)).not.toContain(skip)
    expect(table.morning).toHaveLength(6)
  })

  it('refuses a side of one kind, however many activities it has', () => {
    const samey: RdActivity[] = RD_FIXTURE_MORNING.map((item) => ({
      activity: item.activity,
      concept: item.concept ?? '',
      kind: 'rest',
    }))
    expect(sideCanFill(samey)).toBe(false)
    expect(pickRdSide(samey, always, [])).toBeNull()
  })

  it('never prints a partial table', () => {
    const { morning, afternoon } = pools()
    expect(buildRdTable({ morning: morning.slice(0, 5), afternoon }, always)).toBeNull()
    expect(buildRdTable({ morning, afternoon: afternoon.slice(0, 4) }, always)).toBeNull()
  })

  it('names what is wrong with a table that should not print', () => {
    const table = buildRdTable(pools(), always)!
    const doubled = { ...table, morning: table.morning.map((entry, i) => ({ ...entry, face: i === 5 ? 5 : entry.face })) }
    expect(rdTableProblem(doubled)).toMatch(/die face/)
    const clash = {
      ...table,
      afternoon: table.afternoon.map((entry, i) =>
        i === 0 ? { ...entry, activity: 'Sip a coffee at a new cafe' } : entry,
      ),
    }
    expect(rdTableProblem(clash)).toMatch(/too alike/)
  })
})
