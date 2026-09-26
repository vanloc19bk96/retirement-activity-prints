import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CBN_ANCHOR_THEME,
  CBN_BLOCKED_TERMS,
  CBN_BLOCKED_UNITS,
  CBN_COUNTS,
  CBN_DEFAULT_TITLE,
  CBN_DISTANCES,
  CBN_EXAMPLE_QUESTIONS,
  CBN_FIRST_PERSON_WORDS,
  CBN_GENDERED_WORDS,
  CBN_GENERIC_WORDS,
  CBN_GROUP_MAX,
  CBN_KILOMETRES_WORDS,
  CBN_LIMITS,
  CBN_MILES_WORDS,
  CBN_PHRASES,
  CBN_QUALIFIER_WORDS,
  CBN_READER_WORDS,
  CBN_SCOPE_TERMS,
  CBN_SHAPES,
  CBN_SUBJECT_WORDS,
  CBN_SYNONYMS,
  CBN_THEMES,
  CBN_WORKPLACES,
  cbnMemoryLabel,
  cbnSetProblem,
  cbnSetRules,
  cbnShortfall,
  cbnTitleFor,
  cleanCbnPool,
  groupCap,
  groupsOf,
  isAnchor,
  normalizeQuestion,
  normalizeUnit,
  numberCbnSet,
  openingOf,
  orderCbnSet,
  pickCbnSet,
  questionSubjects,
  questionTokens,
  questionsRepeat,
  setConflict,
  type CbnQuestion,
} from './content'
import { CBN_FIXTURE, CBN_FIXTURE_ITEMS, CBN_FIXTURE_QUESTIONS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits and theme groups must be the service's own. This reads the data
 * file the service loads, so a list edited on one side only fails here
 * instead of the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/career-by-the-numbers/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  anchorTheme: string
  workplaces: Record<string, unknown>
  distances: Record<string, { label: string; unit: string }>
  groups: Record<string, { max: number }>
  shapes: Record<string, string>
  themes: Record<string, { group: string }>
}

const pool = (): CbnQuestion[] => cleanCbnPool(CBN_FIXTURE.questions)

describe('career-by-the-numbers lists mirror the service', () => {
  it.each([
    ['scopeTerms', CBN_SCOPE_TERMS],
    ['readerWords', CBN_READER_WORDS],
    ['firstPersonWords', CBN_FIRST_PERSON_WORDS],
    ['genderedWords', CBN_GENDERED_WORDS],
    ['blockedTerms', CBN_BLOCKED_TERMS],
    ['blockedUnits', CBN_BLOCKED_UNITS],
    ['milesWords', CBN_MILES_WORDS],
    ['kilometresWords', CBN_KILOMETRES_WORDS],
    ['qualifierWords', CBN_QUALIFIER_WORDS],
    ['genericWords', CBN_GENERIC_WORDS],
    ['exampleQuestions', CBN_EXAMPLE_QUESTIONS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same phrases, synonyms and subjects', () => {
    expect(CBN_PHRASES).toEqual(config.phrases)
    expect(CBN_SYNONYMS).toEqual(config.synonyms)
    expect(CBN_SUBJECT_WORDS).toEqual(config.subjectWords)
  })

  it('shares limits, themes, groups, shapes, workplaces and distances', () => {
    expect({ ...CBN_LIMITS }).toEqual(config.limits)
    expect(CBN_ANCHOR_THEME).toBe(config.anchorTheme)
    expect(CBN_THEMES).toEqual(Object.fromEntries(Object.entries(config.themes).map(([k, t]) => [k, t.group])))
    expect(CBN_GROUP_MAX).toEqual(Object.fromEntries(Object.entries(config.groups).map(([k, g]) => [k, g.max])))
    expect([...CBN_SHAPES]).toEqual(Object.keys(config.shapes))
    expect(CBN_WORKPLACES.map((w) => w.value)).toEqual(Object.keys(config.workplaces))
    expect(CBN_DISTANCES.map((d) => [d.value, d.label, d.unit])).toEqual(
      Object.entries(config.distances).map(([k, d]) => [k, d.label, d.unit]),
    )
    expect(Math.max(...CBN_COUNTS)).toBeLessThanOrEqual(CBN_LIMITS.maxItems)
  })
})

describe('career-by-the-numbers gates', () => {
  it('accepts every fixture question and unit as written, all distinct', () => {
    for (const item of CBN_FIXTURE_ITEMS) {
      expect(normalizeQuestion(item.question)).toBe(item.question)
      expect(normalizeUnit(item.unit, item.question)).toBe(item.unit)
    }
    CBN_FIXTURE_QUESTIONS.forEach((a, i) => {
      for (const b of CBN_FIXTURE_QUESTIONS.slice(0, i)) expect(questionsRepeat(a, b), `${a} | ${b}`).toBe(false)
    })
    expect(pool()).toHaveLength(CBN_FIXTURE_ITEMS.length)
  })

  it('sets curly apostrophes and a first capital, and nothing else', () => {
    expect(normalizeQuestion("3. about how many of your coworkers' birthdays did you celebrate over the years?")).toBe(
      'About how many of your coworkers’ birthdays did you celebrate over the years?',
    )
    expect(normalizeQuestion('"On a typical day, how many times did you check the rota?"')).toBe(
      'On a typical day, how many times did you check the rota?',
    )
  })

  it.each([
    'How much work did you do over your career?',
    'How busy were you over your whole career?',
    'How many emails did you send and how many did you read each day?',
    'About how many meetings did you attend over your career.',
    'How many meetings did you attend over your career!',
    'Did you ever count how many meetings you attended over your career?',
    'About how many meetings did you attend?',
    "You attended 14,782 meetings over your career, didn't you?",
    'About how many cups of coffee did you drink in 1987?',
    'How many coffees did I drink over my career?',
    'How many times did he lose his keys over the years?',
    'About how many sick days did you take over your career?',
    'How many times did your boss yell at you over the years?',
    'How many pay rises did you get over your career?',
    'How many times did you forget a password over your career?',
    'How many beers did you have after work over the years?',
    'How many mistakes did you make in a typical week?',
    'In a typical week, how many hours did you spend, give or take?',
    'HOW MANY MEETINGS DID YOU ATTEND OVER YOUR CAREER?',
    '"How many meetings" did you attend over your career?',
    'How many, your career?',
    'How many Monday mornings did you show up for over the years?',
  ])('rejects %s', (question) => {
    expect(normalizeQuestion(question)).toBeNull()
  })

  it('asks distances only in the unit the seller chose', () => {
    const km = 'About how many kilometres did you drive for work over your career?'
    expect(normalizeQuestion(km, undefined, 'miles')).toBeNull()
    expect(normalizeQuestion(km, undefined, 'km')).toBe(km)
    expect(normalizeUnit('kilometres', km, undefined, 'km')).toBe('kilometres')
    expect(normalizeUnit('miles', CBN_FIXTURE_QUESTIONS[7]!, undefined, 'km')).toBeNull()
    // A pool read for kilometres never keeps a miles question.
    const kmPool = cleanCbnPool(CBN_FIXTURE.questions, { distance: 'km' })
    expect(kmPool.map((q) => q.question)).not.toContain(CBN_FIXTURE_QUESTIONS[7])
  })

  it('takes the unit from the question', () => {
    const question = 'About how many cups of coffee did you drink over your career?'
    expect(normalizeUnit('cups', question)).toBe('cups')
    expect(normalizeUnit('Cups.', question)).toBe('cups')
    for (const unit of ['mugs', 'cups of coffee', 'things', 'total', 'dollars', 'cups!', '2 cups']) {
      expect(normalizeUnit(unit, question), unit).toBeNull()
    }
    expect(normalizeUnit('calls', CBN_FIXTURE_QUESTIONS[6]!)).toBeNull()
  })

  it('folds questions to what they count', () => {
    expect(
      questionsRepeat(
        'About how many meetings did you attend over your career?',
        'Roughly how many meetings were you in over the years?',
      ),
    ).toBe(true)
    expect(
      questionsRepeat(
        'On a typical workday, how many cups of coffee did you drink?',
        'About how many coffee breaks did you take over your career?',
      ),
    ).toBe(true)
    expect(questionTokens('In a typical week, how many hours did you spend at work?').size).toBe(0)
  })

  it('spots what a question is really about', () => {
    expect([...questionSubjects(CBN_FIXTURE_QUESTIONS[1]!)]).toEqual(['drinks'])
    expect([...questionSubjects(CBN_FIXTURE_QUESTIONS[30]!)]).toEqual(['commute'])
    expect([...questionSubjects(CBN_FIXTURE_QUESTIONS[25]!)]).toEqual(['tech'])
  })

  it('remembers a question from “How many” on, cut on a word', () => {
    expect(cbnMemoryLabel(CBN_FIXTURE_QUESTIONS[12]!)).toBe('How many breaks did you spend laughing with coworkers?')
    for (const question of CBN_FIXTURE_QUESTIONS) {
      const label = cbnMemoryLabel(question)
      expect(label.length).toBeLessThanOrEqual(60)
      expect(questionsRepeat(label, question), question).toBe(true)
    }
  })

  it('titles the page for the retiree only while the default heading is kept', () => {
    expect(cbnTitleFor(CBN_DEFAULT_TITLE, 'Linda')).toBe('Linda’s Career By the Numbers')
    expect(cbnTitleFor(CBN_DEFAULT_TITLE, 'James')).toBe('James’ Career By the Numbers')
    expect(cbnTitleFor('Work in Numbers', 'Linda')).toBe('Work in Numbers')
    expect(cbnTitleFor('', 'Linda')).toBe('')
  })
})

describe('career-by-the-numbers sets', () => {
  it.each(CBN_COUNTS)('picks a balanced set of %i from the fixture', (size) => {
    const { picks } = pickCbnSet(pool(), size)
    expect(picks).not.toBeNull()
    const set = picks!
    expect(set).toHaveLength(size)
    const rules = cbnSetRules(size)
    expect(new Set(set.map((q) => q.theme)).size).toBeGreaterThanOrEqual(rules.minThemes)
    expect(set.filter((q) => q.tone === 'nostalgic').length).toBeGreaterThanOrEqual(rules.minNostalgic)
    expect(set.filter((q) => q.tone === 'playful').length).toBeGreaterThanOrEqual(rules.minPlayful)
    expect(set.some(isAnchor)).toBe(true)
    const groups = new Map<string, number>()
    for (const q of set) for (const g of groupsOf(q)) groups.set(g, (groups.get(g) ?? 0) + 1)
    for (const [group, count] of groups) expect(count, group).toBeLessThanOrEqual(groupCap(group, size))
    set.forEach((q, i) => expect(setConflict(set.slice(0, i), q, size)).toBeNull())
  })

  it('counts a question by what it is really about, whatever its brief said', () => {
    const coffee = { ...CBN_FIXTURE_ITEMS[1]!, concept: '' } as CbnQuestion
    const mugs: CbnQuestion = {
      question: 'How many mugs did you collect at work over the years?',
      unit: 'mugs',
      theme: 'workspace',
      tone: 'playful',
      shape: 'tally',
      concept: 'mugs collected',
    }
    expect(groupsOf(mugs).has('drinks')).toBe(true)
    expect(setConflict([coffee], mugs, 10)).toBe('group')
  })

  it('closes on the road to retirement and opens on a playful question', () => {
    const { picks } = pickCbnSet(pool(), 10)
    for (const seed of [1, 2, 3, 42]) {
      const ordered = orderCbnSet(picks!, seed)
      expect(ordered.at(-1)!.theme).toBe(CBN_ANCHOR_THEME)
      expect(ordered[0]!.tone).toBe('playful')
      expect(cbnSetProblem(numberCbnSet(ordered), 10)).toBeNull()
    }
    expect(orderCbnSet(picks!, 1)).not.toEqual(orderCbnSet(picks!, 2))
  })

  it('avoids neighbours with the same opening where it can', () => {
    const ordered = orderCbnSet(pickCbnSet(pool(), 12).picks!, 7)
    let same = 0
    for (let i = 1; i < ordered.length; i++) {
      if (openingOf(ordered[i]!.question) === openingOf(ordered[i - 1]!.question)) same++
    }
    expect(same).toBeLessThanOrEqual(1)
  })

  it('never keeps what the book already prints', () => {
    const kept = cleanCbnPool(CBN_FIXTURE.questions, { avoid: ['How many meetings did you sit through?'] })
    expect(kept.map((q) => q.question)).not.toContain(CBN_FIXTURE_QUESTIONS[4])
  })

  it('asks a top-up for unused themes and the tone the set is short of', () => {
    const playful = pool().filter((q) => q.tone === 'playful')
    const { picks, taken } = pickCbnSet(playful, 10)
    expect(picks).toBeNull()
    const ask = cbnShortfall(taken, 10)
    expect(ask.tone).toBe('nostalgic')
    for (const theme of ask.themes) expect(taken.map((q) => q.theme)).not.toContain(theme)
    expect(ask.count).toBeGreaterThan(0)
  })

  it('refuses a set that is short, misnumbered or tampered with', () => {
    const set = numberCbnSet(orderCbnSet(pickCbnSet(pool(), 8).picks!, 1))
    expect(cbnSetProblem(set.slice(1), 8)).toMatch(/holds 7/)
    expect(cbnSetProblem(set.map((q, i) => (i === 0 ? { ...q, number: 5 } : q)), 8)).toMatch(/numbered/)
    const tampered = set.map((q, i) => (i === 2 ? { ...q, question: 'You drank 12,000 coffees over your career?' } : q))
    expect(cbnSetProblem(tampered, 8)).toMatch(/not suitable/)
    const wrongUnit = set.map((q, i) => (i === 2 ? { ...q, unit: 'dollars' } : q))
    expect(cbnSetProblem(wrongUnit, 8)).toMatch(/not suitable/)
  })
})
