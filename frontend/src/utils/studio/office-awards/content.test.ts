import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  OA_ANCHOR_THEME,
  OA_BLOCKED_TERMS,
  OA_COUNTS,
  OA_DEFAULT_TITLE,
  OA_EXAMPLE_AWARDS,
  OA_GENDERED_WORDS,
  OA_GENERIC_WORDS,
  OA_GROUP_MAX,
  OA_LIMITS,
  OA_PHRASES,
  OA_QUALIFIER_WORDS,
  OA_READER_WORDS,
  OA_SHAPES,
  OA_SUBJECT_WORDS,
  OA_SYNONYMS,
  OA_THEMES,
  OA_WORKPLACES,
  awardSubjects,
  awardTokens,
  awardsRepeat,
  cleanOaPool,
  groupCap,
  groupsOf,
  isFarewell,
  numberOaSet,
  normalizeAward,
  oaDisplayAward,
  oaInstruction,
  oaSetProblem,
  oaSetRules,
  oaShortfall,
  oaTitleFor,
  openingOf,
  orderOaSet,
  pickOaSet,
  setConflict,
  titleCase,
  type OaAward,
} from './content'
import { OA_FIXTURE, OA_FIXTURE_AWARDS, OA_FIXTURE_ITEMS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits and theme groups must be the service's own. This reads the data
 * file the service loads, so a list edited on one side only fails here
 * instead of the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/office-awards/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  anchorTheme: string
  workplaces: Record<string, unknown>
  groups: Record<string, { max: number }>
  shapes: Record<string, string>
  themes: Record<string, { group: string }>
}

const pool = (): OaAward[] => cleanOaPool(OA_FIXTURE.awards)

describe('office-awards lists mirror the service', () => {
  it.each([
    ['readerWords', OA_READER_WORDS],
    ['genderedWords', OA_GENDERED_WORDS],
    ['blockedTerms', OA_BLOCKED_TERMS],
    ['genericWords', OA_GENERIC_WORDS],
    ['qualifierWords', OA_QUALIFIER_WORDS],
    ['exampleAwards', OA_EXAMPLE_AWARDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same phrases, synonyms and subjects', () => {
    expect(OA_PHRASES).toEqual(config.phrases)
    expect(OA_SYNONYMS).toEqual(config.synonyms)
    expect(OA_SUBJECT_WORDS).toEqual(config.subjectWords)
  })

  it('shares limits, themes, groups, shapes and workplaces', () => {
    expect({ ...OA_LIMITS }).toEqual(config.limits)
    expect(OA_ANCHOR_THEME).toBe(config.anchorTheme)
    expect(OA_THEMES).toEqual(Object.fromEntries(Object.entries(config.themes).map(([k, t]) => [k, t.group])))
    expect(OA_GROUP_MAX).toEqual(Object.fromEntries(Object.entries(config.groups).map(([k, g]) => [k, g.max])))
    expect([...OA_SHAPES]).toEqual(Object.keys(config.shapes))
    expect(OA_WORKPLACES.map((w) => w.value)).toEqual(Object.keys(config.workplaces))
    expect(Math.max(...OA_COUNTS)).toBeLessThanOrEqual(OA_LIMITS.maxAwards)
  })
})

describe('office-awards gates', () => {
  it('accepts every fixture award as written, all distinct', () => {
    for (const award of OA_FIXTURE_AWARDS) expect(normalizeAward(award)).toBe(award)
    OA_FIXTURE_AWARDS.forEach((a, i) => {
      for (const b of OA_FIXTURE_AWARDS.slice(0, i)) expect(awardsRepeat(a, b), `${a} | ${b}`).toBe(false)
    })
    expect(pool()).toHaveLength(OA_FIXTURE_ITEMS.length)
  })

  it('sets title case and curly apostrophes, and nothing else', () => {
    expect(normalizeAward('most likely to rescue the stapler')).toBe('Most Likely to Rescue the Stapler')
    expect(normalizeAward("2. Keeper of the retiree's Desk Plant")).toBe('Keeper of the Retiree’s Desk Plant')
    expect(titleCase('the always-has-a-map award')).toBe('The Always-Has-a-Map Award')
    expect(titleCase('unofficial IT whisperer')).toBe('Unofficial IT Whisperer')
  })

  it.each([
    'Best Coworker Ever',
    'Most Valuable Team Member',
    'Worst Timekeeper',
    'Least Productive Afternoon',
    'Most Likely to Get Fired',
    'Biggest Complainer',
    'Office Queen of Spreadsheets',
    'Nicest Guy in Accounts',
    'Best Dressed on Fridays',
    'Most Likely to Nap at Their Desk',
    'Oldest Coffee Mug',
    'Happy Hour Organizer',
    'Your Favourite Colleague',
    'Most Likely to Fix the Printer!',
    'Who Fixes the Printer?',
    'Office Oscars Winner',
    'Starbucks Run Champion',
    'FASTEST EMAIL REPLY',
    'Champion',
    'Most Likely to Know Every Single Shortcut on Every Keyboard in the Building',
    'Friendliest Hello on a Monday',
  ])('rejects %s', (award) => {
    expect(normalizeAward(award)).toBeNull()
  })

  it('catches the same idea in other words, and what an award is really about', () => {
    expect(awardsRepeat('Most Coffee Consumed', 'Biggest Coffee Drinker')).toBe(true)
    expect(awardsRepeat('Tidiest Desk in the Building', 'The Tidiest Desk Award')).toBe(true)
    expect(awardTokens('Best Coworker of the Year').size).toBe(0)
    expect([...awardSubjects('Always First to Put the Kettle On')]).toEqual(['drinks'])
    expect([...awardSubjects('Lender of the Spare Phone Charger')]).toEqual([])
    // A coffee award written for a teamwork brief is still the set's coffee award.
    expect([...groupsOf({ award: 'Makes Coffee for the Whole Team', theme: 'teamwork' })].sort()).toEqual([
      'drinks',
      'teamwork',
    ])
  })

  it('drops repeats of what the book already prints', () => {
    const cleaned = cleanOaPool(OA_FIXTURE.awards, { avoid: ['Biggest Snack Drawer Keeper'] })
    expect(cleaned.map((a) => a.award)).not.toContain('Keeper of the Emergency Snack Drawer')
    expect(cleanOaPool([{ award: 'Best Dressed', theme: 'lunch', tone: 'warm', shape: 'superlative' }])).toEqual([])
    expect(cleanOaPool([{ award: 'Most Patient Teacher', theme: 'nope', tone: 'warm', shape: 'superlative' }])).toEqual([])
  })
})

describe('office-awards set', () => {
  it.each(OA_COUNTS)('picks a balanced set of %i from the fixture', (size) => {
    const { picks } = pickOaSet(pool(), size)
    expect(picks).not.toBeNull()
    const set = picks!
    const rules = oaSetRules(size)
    expect(set).toHaveLength(size)
    expect(set.some(isFarewell)).toBe(true)
    expect(new Set(set.map((a) => a.theme)).size).toBeGreaterThanOrEqual(rules.minThemes)
    const warm = set.filter((a) => a.tone === 'warm').length
    expect(warm).toBeGreaterThanOrEqual(rules.minWarm)
    expect(size - warm).toBeGreaterThanOrEqual(rules.minPlayful)
    for (const group of new Set(set.flatMap((a) => [...groupsOf(a)]))) {
      expect(set.filter((a) => groupsOf(a).has(group)).length).toBeLessThanOrEqual(groupCap(group, size))
    }
    expect(oaSetProblem(numberOaSet(orderOaSet(set, 3)), size)).toBeNull()
  })

  it('never lets one subject swamp a set', () => {
    const coffee: OaAward[] = [
      { award: 'Always First to Put the Kettle On', theme: 'hot-drinks', tone: 'playful', shape: 'habit', concept: '' },
      { award: 'Makes Coffee for the Whole Team', theme: 'teamwork', tone: 'warm', shape: 'habit', concept: '' },
    ]
    expect(setConflict([coffee[0]!], coffee[1]!, 24)).toBe('group')
  })

  it('keeps the funny and the warm in balance', () => {
    const playful = pool().filter((a) => a.tone === 'playful')
    expect(pickOaSet(playful, 8).picks).toBeNull()
    const { taken } = pickOaSet(playful, 8)
    expect(taken.filter((a) => a.tone === 'playful').length).toBeLessThanOrEqual(8 - oaSetRules(8).minWarm)
    expect(oaShortfall(taken, 8).tone).toBe('warm')
  })

  it('passes over awards that do not fit their card', () => {
    const { picks } = pickOaSet(pool(), 10, (a) => a.award.length < 32)
    expect(picks).not.toBeNull()
    expect(picks!.every((a) => a.award.length < 32)).toBe(true)
  })

  it('asks a top-up for themes the set does not use yet, farewell first', () => {
    const noFarewell = pool().filter((a) => !isFarewell(a)).slice(0, 4)
    const ask = oaShortfall(noFarewell, 10)
    expect(ask.themes[0]).toBe(OA_ANCHOR_THEME)
    expect(ask.themes).not.toContain(noFarewell[0]!.theme)
    expect(ask.count).toBe(10)
  })

  it('orders by seed: playful opener, farewell closer, no same-group neighbours', () => {
    const picks = pickOaSet(pool(), 12).picks!
    const a = orderOaSet(picks, 1)
    const b = orderOaSet(picks, 2)
    expect(a).not.toEqual(b)
    for (const order of [a, b]) {
      expect(order[0]!.tone).toBe('playful')
      expect(isFarewell(order.at(-1)!)).toBe(true)
      for (let i = 1; i < order.length; i++) {
        expect(openingOf(order[i]!.award) === openingOf(order[i - 1]!.award) && order[i]!.shape === order[i - 1]!.shape).toBe(false)
      }
    }
    expect(orderOaSet(picks, 1)).toEqual(a)
  })

  it('reports a set that is short, misnumbered or repeats itself', () => {
    const set = numberOaSet(orderOaSet(pickOaSet(pool(), 8).picks!, 1))
    expect(oaSetProblem(set.slice(0, 7), 8)).toMatch(/7 awards/)
    expect(oaSetProblem([set[1]!, set[0]!, ...set.slice(2)], 8)).toMatch(/numbered/)
    const twin = { ...set[1]!, award: set[0]!.award, number: 2 }
    expect(oaSetProblem([set[0]!, twin, ...set.slice(2)], 8)).not.toBeNull()
  })
})

describe('office-awards naming', () => {
  it('prints the retiree’s name where the service wrote “the Retiree”', () => {
    expect(oaDisplayAward('Most Likely to Inherit the Retiree’s Chair', 'Linda')).toBe('Most Likely to Inherit Linda’s Chair')
    expect(oaDisplayAward('Keeps in Touch With the Retiree', 'James')).toBe('Keeps in Touch With James')
    expect(oaDisplayAward('The Retiree’s Right Hand', 'James')).toBe('James’ Right Hand')
    expect(oaDisplayAward('Most Likely to Inherit the Retiree’s Chair', '')).toBe('Most Likely to Inherit the Retiree’s Chair')
  })

  it('names the page and the how-to', () => {
    expect(oaTitleFor(OA_DEFAULT_TITLE, 'Linda')).toBe('Linda’s Farewell Office Awards')
    expect(oaTitleFor(OA_DEFAULT_TITLE, '')).toBe(OA_DEFAULT_TITLE)
    expect(oaTitleFor('Team Trophies', 'Linda')).toBe('Team Trophies')
    expect(oaTitleFor('', 'Linda')).toBe('')
    expect(oaInstruction('Linda', false)).toContain('even Linda!')
    expect(oaInstruction('', true)).toContain('“Why” line')
  })
})
