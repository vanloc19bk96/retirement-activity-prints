import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  WKB_ANCHOR_TOPIC,
  WKB_BLOCKED_TERMS,
  WKB_GENDERED_WORDS,
  WKB_GROUP_MAX,
  WKB_LIMITS,
  WKB_PHRASES,
  WKB_QUALIFIER_WORDS,
  WKB_QUESTIONS,
  WKB_READER_WORDS,
  WKB_RETIREE_WORDS,
  WKB_SAYING_TERMS,
  WKB_SHAPES,
  WKB_SYNONYMS,
  WKB_TOPICS,
  answerFloor,
  cleanWkbPool,
  groupOf,
  isFavourite,
  isFuture,
  normalizeAnswer,
  normalizeQuestion,
  numberWkbSet,
  openingOf,
  orderWkbSet,
  parseRetireeName,
  pickWkbSet,
  possessive,
  questionsRepeat,
  retireeNameProblem,
  wkbAnswersInstruction,
  wkbAnswersTitleFor,
  wkbEligibleTopics,
  wkbPlayerInstruction,
  wkbSetProblem,
  wkbShortfall,
  wkbTitleFor,
  WKB_DEFAULT_TITLE,
  type WkbQuestion,
} from './content'
import { WKB_FIXTURE, WKB_FIXTURE_ITEMS, WKB_FIXTURE_QUESTIONS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits and topic bank must be the service's own. This reads the data file
 * the service loads, so a list edited on one side only fails here instead of
 * the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/who-knows-retiree-best/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  groups: Record<string, { max: number }>
  shapes: Record<string, string>
  topics: Record<string, { group: string; audiences: Record<string, number>; shapes: string[]; facets: string[] }>
}

const pool = (): WkbQuestion[] => cleanWkbPool(WKB_FIXTURE.questions)

describe('who-knows-retiree-best lists mirror the service', () => {
  it.each([
    ['retireeWords', WKB_RETIREE_WORDS],
    ['readerWords', WKB_READER_WORDS],
    ['genderedWords', WKB_GENDERED_WORDS],
    ['sayingTerms', WKB_SAYING_TERMS],
    ['qualifierWords', WKB_QUALIFIER_WORDS],
    ['blockedTerms', WKB_BLOCKED_TERMS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same phrases and synonyms', () => {
    expect(WKB_PHRASES).toEqual(config.phrases)
    expect(WKB_SYNONYMS).toEqual(config.synonyms)
  })

  it('keeps the same limits', () => {
    for (const [key, value] of Object.entries(WKB_LIMITS)) expect(value, key).toBe(config.limits[key])
  })

  it('balances over the same topics, groups and shapes', () => {
    expect(Object.keys(WKB_TOPICS)).toEqual(Object.keys(config.topics))
    for (const [key, topic] of Object.entries(config.topics)) {
      expect(WKB_TOPICS[key]!.group, key).toBe(topic.group)
      expect(WKB_TOPICS[key]!.audiences, key).toEqual(topic.audiences)
      for (const shape of topic.shapes) expect(WKB_SHAPES, key).toContain(shape)
      // Every topic can fill a set's worth of questions without repeating a facet.
      expect(topic.facets.length, key).toBeGreaterThanOrEqual(10)
    }
    expect(Object.fromEntries(Object.entries(config.groups).map(([k, g]) => [k, g.max]))).toEqual(WKB_GROUP_MAX)
    expect([...WKB_SHAPES]).toEqual(Object.keys(config.shapes))
    expect(WKB_TOPICS[WKB_ANCHOR_TOPIC]!.group).toBe('future')
  })

  it('has enough topics for twelve different ones in every audience', () => {
    for (const audience of ['mixed', 'work', 'family'] as const) {
      expect(wkbEligibleTopics(audience).length).toBeGreaterThanOrEqual(WKB_QUESTIONS)
    }
    expect(wkbEligibleTopics('family').map(groupOf)).not.toContain('office')
  })
})

describe('the fixture', () => {
  it('is valid and distinct, spares included', () => {
    expect(pool().map((q) => q.question)).toEqual(WKB_FIXTURE_QUESTIONS)
  })
})

describe('normalizeQuestion', () => {
  it.each([
    'What was the very first job they were ever paid to do?',
    'Tea, coffee or hot chocolate: which would they pick first?',
    'What time did they usually arrive on a workday?',
    'If they opened a small shop, what would it sell?',
    "What's the one thing they'd never leave home without?",
    'Early bird or night owl: which one are they?',
  ])('prints %s', (question) => {
    expect(normalizeQuestion(question)).toBe(question)
  })

  it('strips numbering and edge quotes, never anything else', () => {
    expect(normalizeQuestion('3. “What time did they usually arrive on a workday?”')).toBe(
      'What time did they usually arrive on a workday?',
    )
  })

  it.each([
    ['too broad', 'What do they enjoy?'],
    ['not a question', 'Name their first job'],
    ['two questions', 'What was their first job? Did they like it?'],
    ['a second sentence', 'Think back. What was their first job?'],
    ['talks to the player', 'What is your favourite memory of them?'],
    ['gendered', 'What would she order for lunch?'],
    ['not about them', 'What is the best snack for a road trip?'],
    ['age', 'How old were they when they started here?'],
    ['born', 'Which year were they born?'],
    ['money', 'What would they do with their pension?'],
    ['health', 'Which doctor do they see most often?'],
    ['weight', 'How much do they weigh now?'],
    ['relationships', 'Where did they go on their first date?'],
    ['family assumed', 'What are their grandchildren called?'],
    ['security question', 'What was the name of their first pet?'],
    ['security question', 'What street did they grow up on?'],
    ['embarrassing', 'What is their most embarrassing moment at work?'],
    ['secret', 'What secret have they never told anyone?'],
    ['alcohol', 'What wine do they order at dinner?'],
    ['politics', 'How do they usually vote?'],
    ['religion', 'Which church do they go to?'],
    ['brand', 'What do they order at Starbucks?'],
    ['quotation', 'Which movie quote do they repeat most?'],
    ['put-down', 'What is their most annoying habit?'],
    ['age stereotype', 'How forgetful are they before coffee?'],
    ['quotation marks', 'Do they say "right then" or "off we go"?'],
    ['shouting', 'WHAT WAS THEIR FIRST JOB?'],
    ['too long', `What ${'very '.repeat(20)}first job did they have?`],
    ['too short', 'Their job?'],
  ])('drops a question that is %s', (_why, question) => {
    expect(normalizeQuestion(question)).toBeNull()
  })
})

describe('answer room', () => {
  it('never gives a saying or a story a short line', () => {
    expect(answerFloor('What do they always say when a plan goes sideways?')).toBe('sentence')
    expect(normalizeAnswer('word', 'What do they always say when a plan goes sideways?')).toBe('sentence')
    expect(normalizeAnswer('phrase', 'What piece of advice did they give every new starter?')).toBe('sentence')
  })

  it('keeps the size asked for otherwise, and refuses an unknown one', () => {
    expect(normalizeAnswer('word', 'What time did they usually arrive on a workday?')).toBe('word')
    expect(normalizeAnswer('Phrase', 'What do they usually order when eating out?')).toBe('phrase')
    expect(normalizeAnswer('paragraph', 'What do they usually order when eating out?')).toBeNull()
  })
})

describe('questionsRepeat', () => {
  it.each([
    ['What was their first job?', 'Where did they work first?'],
    ['What was their first job?', 'What was the first job they ever had?'],
    ['What food do they like most?', 'What is their favourite food?'],
    ['Where would they most like to travel?', 'What place will they finally have time to visit?'],
    ['What would their perfect day off look like?', 'What would they do with a completely free day?'],
    ['What is their signature saying?', 'Which phrase do they always say?'],
  ])('treats "%s" and "%s" as one question', (a, b) => {
    expect(questionsRepeat(a, b)).toBe(true)
  })

  it.each([
    ['What was their first job?', 'What time did they usually arrive at work?'],
    ['What was their first job?', 'What did they want to be when they grew up?'],
    ['Which hobby could they talk about for hours?', 'Which film would they watch again and again?'],
    ['What do they usually order when eating out?', 'What snack would they pack for a long train journey?'],
  ])('keeps "%s" and "%s" apart', (a, b) => {
    expect(questionsRepeat(a, b)).toBe(false)
  })

  it('holds the whole fixture apart', () => {
    for (let i = 0; i < WKB_FIXTURE_QUESTIONS.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(questionsRepeat(WKB_FIXTURE_QUESTIONS[i]!, WKB_FIXTURE_QUESTIONS[j]!), `${i} vs ${j}`).toBe(false)
      }
    }
  })
})

describe('cleanWkbPool', () => {
  it('drops questions the book already prints, in other words too', () => {
    const cleaned = cleanWkbPool(WKB_FIXTURE.questions, { avoid: ['Where did they first work for pay?'] })
    expect(cleaned.map((q) => q.topic)).not.toContain('career-path')
    expect(cleaned).toHaveLength(WKB_FIXTURE_ITEMS.length - 1)
  })

  it('drops repeats within a reply, unknown topics and malformed items, never repairing one', () => {
    const cleaned = cleanWkbPool([
      WKB_FIXTURE_ITEMS[1],
      { ...WKB_FIXTURE_ITEMS[1], question: 'Where did they work first?' },
      { ...WKB_FIXTURE_ITEMS[2], topic: 'secrets' },
      { ...WKB_FIXTURE_ITEMS[3], shape: 'essay' },
      { ...WKB_FIXTURE_ITEMS[4], answer: undefined },
      'What was their first car?',
      null,
    ])
    expect(cleaned.map((q) => q.question)).toEqual([WKB_FIXTURE_ITEMS[1]!.question])
  })

  it('adds a top-up to what it already holds', () => {
    const first = cleanWkbPool(WKB_FIXTURE.questions.slice(0, 10))
    const merged = cleanWkbPool(WKB_FIXTURE.questions, { keep: first })
    expect(merged.map((q) => q.question)).toEqual(WKB_FIXTURE_QUESTIONS)
  })
})

function assertBalanced(set: readonly WkbQuestion[]) {
  expect(set).toHaveLength(WKB_QUESTIONS)
  const topics = new Map<string, number>()
  const groups = new Map<string, number>()
  const shapes = new Map<string, number>()
  const openings = new Map<string, number>()
  for (const q of set) {
    topics.set(q.topic, (topics.get(q.topic) ?? 0) + 1)
    groups.set(groupOf(q.topic), (groups.get(groupOf(q.topic)) ?? 0) + 1)
    shapes.set(q.shape, (shapes.get(q.shape) ?? 0) + 1)
    openings.set(openingOf(q.question), (openings.get(openingOf(q.question)) ?? 0) + 1)
  }
  expect(topics.size).toBeGreaterThanOrEqual(WKB_LIMITS.minTopics)
  expect(Math.max(...topics.values())).toBeLessThanOrEqual(WKB_LIMITS.topicMax)
  for (const [group, n] of groups) expect(n, group).toBeLessThanOrEqual(WKB_GROUP_MAX[group]!)
  expect(Math.max(...shapes.values())).toBeLessThanOrEqual(WKB_LIMITS.shapeMax)
  expect(Math.max(...openings.values())).toBeLessThanOrEqual(WKB_LIMITS.openingMax)
  expect(set.filter((q) => isFavourite(q.question)).length).toBeLessThanOrEqual(WKB_LIMITS.favouriteMax)
  expect(set.some(isFuture)).toBe(true)
}

describe('pickWkbSet', () => {
  it('picks twelve balanced questions, one per topic first', () => {
    const { picks } = pickWkbSet(pool())
    expect(picks).not.toBeNull()
    assertBalanced(picks!)
    expect(new Set(picks!.map((q) => q.topic)).size).toBe(WKB_QUESTIONS)
  })

  it('passes over a question that does not fit its block for a spare', () => {
    const skipped = WKB_FIXTURE_ITEMS[5]!.question
    const { picks } = pickWkbSet(pool(), (q) => q !== skipped)
    expect(picks).not.toBeNull()
    expect(picks!.map((q) => q.question)).not.toContain(skipped)
    assertBalanced(picks!)
  })

  it('never takes a second question on a topic that asks about the same detail', () => {
    const coffee = { topic: 'drinks-snacks', shape: 'habit', answer: 'word', concept: 'coffee style', question: 'How do they take their coffee?' }
    const tea = { topic: 'drinks-snacks', shape: 'choice', answer: 'word', concept: 'tea or coffee', question: 'Tea or coffee: which comes first for them?' }
    const set = pickWkbSet(cleanWkbPool([coffee, tea, ...WKB_FIXTURE.questions]))
    const drinks = set.taken.filter((q) => q.topic === 'drinks-snacks').map((q) => q.question)
    expect(drinks).toContain(coffee.question)
    expect(drinks).not.toContain(tea.question)
  })

  it('keeps "favourite" and look-alike openings in check', () => {
    const favourites = ['colour', 'season', 'sandwich', 'song'].map((thing, i) => ({
      topic: ['personality', 'little-pleasures', 'food', 'entertainment'][i]!,
      shape: 'top-pick',
      answer: 'word',
      concept: `favourite ${thing}`,
      question: `What is their favourite ${thing}?`,
    }))
    const { taken } = pickWkbSet(cleanWkbPool([...favourites, ...WKB_FIXTURE.questions]))
    expect(taken.filter((q) => isFavourite(q.question)).length).toBeLessThanOrEqual(WKB_LIMITS.favouriteMax)
    expect(taken.filter((q) => openingOf(q.question) === 'what is').length).toBeLessThanOrEqual(WKB_LIMITS.openingMax)
  })

  it('refuses a set drawn from too few topics or with no eye on the future', () => {
    expect(pickWkbSet(pool().slice(0, 11)).picks).toBeNull()
    expect(pickWkbSet(pool().filter((q) => !isFuture(q))).picks).toBeNull()
  })
})

describe('wkbShortfall', () => {
  it('asks for topics the set does not use yet, with spares', () => {
    const { taken } = pickWkbSet(pool().slice(0, 9))
    const ask = wkbShortfall(taken, 'mixed')
    for (const topic of ask.topics) expect(taken.map((q) => q.topic)).not.toContain(topic)
    expect(ask.count).toBeGreaterThan(WKB_QUESTIONS - taken.length)
    expect(ask.count).toBeLessThanOrEqual(WKB_LIMITS.maxAsk)
  })

  it('puts the future first when the set has none, and keeps office topics away from family', () => {
    const { taken } = pickWkbSet(pool().filter((q) => !isFuture(q)))
    const ask = wkbShortfall(taken, 'family')
    expect(groupOf(ask.topics[0]!)).toBe('future')
    expect(ask.topics.map(groupOf)).not.toContain('office')
  })
})

describe('orderWkbSet', () => {
  const picks = () => pickWkbSet(pool()).picks!

  it('is deterministic per seed and differs between seeds', () => {
    const a = orderWkbSet(picks(), 1).map((q) => q.question)
    expect(orderWkbSet(picks(), 1).map((q) => q.question)).toEqual(a)
    expect(orderWkbSet(picks(), 2).map((q) => q.question)).not.toEqual(a)
    expect([...a].sort()).toEqual(picks().map((q) => q.question).sort())
  })

  it('closes on retirement plans and opens on a quick answer', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ordered = orderWkbSet(picks(), seed)
      expect(ordered.at(-1)!.topic).toBe(WKB_ANCHOR_TOPIC)
      expect(ordered[0]!.answer).not.toBe('sentence')
    }
  })

  it('keeps neighbours from the same group of topics apart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ordered = orderWkbSet(picks(), seed)
      const runs = ordered.filter((q, i) => i > 0 && groupOf(ordered[i - 1]!.topic) === groupOf(q.topic))
      expect(runs.length, `seed ${seed}`).toBe(0)
    }
  })
})

describe('wkbSetProblem', () => {
  const set = () => numberWkbSet(orderWkbSet(pickWkbSet(pool()).picks!, 3))

  it('passes a picked, ordered, numbered set', () => {
    expect(wkbSetProblem(set())).toBeNull()
  })

  it('catches a missing question, broken numbering and a repeat', () => {
    expect(wkbSetProblem(set().slice(1))).toMatch(/11 questions/)
    const renumbered = set().map((q, i) => (i === 4 ? { ...q, number: 9 } : q))
    expect(wkbSetProblem(renumbered)).toMatch(/numbered/)
    const doubled = set()
    doubled[6] = { ...doubled[6]!, question: 'Where did they work first?', topic: 'career-path', concept: 'first job' }
    expect(wkbSetProblem(doubled)).toMatch(/same thing/)
  })

  it('catches a question no gate would have let through', () => {
    const tampered = set()
    tampered[2] = { ...tampered[2]!, question: 'How old are they now?' }
    expect(wkbSetProblem(tampered)).toMatch(/not suitable/)
  })
})

describe('the retiree’s name', () => {
  it('prints a first name or nickname as typed, with typographic apostrophes', () => {
    expect(parseRetireeName('  Linda ')).toBe('Linda')
    expect(parseRetireeName("Mary-Jo O'Neil")).toBe('Mary-Jo O’Neil')
    expect(parseRetireeName('Aunt  Josephine')).toBe('Aunt Josephine')
    expect(parseRetireeName('José')).toBe('José')
  })

  it('refuses anything that is not a name, and says why', () => {
    for (const raw of ['<b>Linda</b>', 'Linda!', '12345', 'x'.repeat(25), 'Linda / Bob']) {
      expect(parseRetireeName(raw), raw).toBe('')
      expect(retireeNameProblem(raw), raw).toMatch(/letters only/)
    }
    expect(retireeNameProblem('')).toBeNull()
    expect(retireeNameProblem('Linda')).toBeNull()
  })

  it('personalises the default heading only', () => {
    expect(wkbTitleFor(WKB_DEFAULT_TITLE, 'Linda')).toBe('Who Knows Linda Best?')
    expect(wkbTitleFor(WKB_DEFAULT_TITLE, '')).toBe(WKB_DEFAULT_TITLE)
    expect(wkbTitleFor('Farewell Fun for Linda', 'Linda')).toBe('Farewell Fun for Linda')
    expect(wkbTitleFor('', 'Linda')).toBe('')
    expect(wkbAnswersTitleFor('Who Knows James Best?', 'James')).toBe('James’ Real Answers')
    expect(wkbAnswersTitleFor(WKB_DEFAULT_TITLE, '')).toBe('The Real Answers')
    expect(wkbAnswersTitleFor('', 'James')).toBe('')
    expect(possessive('Linda')).toBe('Linda’s')
  })

  it('speaks of "the retiree" when no name is given', () => {
    expect(wkbPlayerInstruction('')).toMatch(/you think the retiree would give/)
    expect(wkbPlayerInstruction('Linda')).toMatch(/you think Linda would give/)
    expect(wkbAnswersInstruction('Linda', 3)).toMatch(/scoreboard/)
    expect(wkbAnswersInstruction('Linda', 1)).not.toMatch(/scoreboard/)
  })
})
