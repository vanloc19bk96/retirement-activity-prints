import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO, STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { workLingoTemplate } from './generate'
import { instructionFor } from './config'
import {
  MIN_PAIRS_PER_PAGE,
  WL_AI_EMPTY_MESSAGE,
  WL_BUILD_FAILED_MESSAGE,
  WL_DEFAULT_TITLE,
  letterWlPairs,
  meaningsClash,
  normalizeWlPair,
  pairsConflict,
  phrasesRelated,
  phrasesRepeat,
  selectWlPairs,
  wlInstruction,
  wlLevelSpec,
} from './content'
import { fitWlPairs } from './fit'
import { runWlKdpPreflight } from './kdp-preflight'
import { TEXT_FONT_MIN, pxToPt, wlPrintNote, wlWorstCasePlan } from './layout'
import { WL_FIXTURE, WL_FIXTURE_PAIRS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(workLingoTemplate),
  showTitle: true,
  title: WL_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = WL_FIXTURE, seed = 42): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
  remoteData,
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8.5, 11],
] as const
const LEVELS = ['gentle', 'classic', 'challenging'] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return workLingoTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const oneLine = (text: string) => text.replace(/\n/g, ' ')
const textboxes = (objects: StudioFabricObject[]) => objects.filter((o) => o.type === 'textbox')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => oneLine(clean(o.text))).filter(Boolean)
const numbers = (objects: StudioFabricObject[]) => textboxes(objects).filter((o) => /^\d+\.$/.test(clean(o.text)))
const letters = (objects: StudioFabricObject[]) => textboxes(objects).filter((o) => /^[A-Z]\.$/.test(clean(o.text)))

const meaningOf = new Map(WL_FIXTURE_PAIRS.map((pair) => [pair.phrase, pair.meaning]))
const fixturePairs = () => selectWlPairs(WL_FIXTURE_PAIRS, { cap: 20 })

/** The textbox on the same row as `anchor`, on the given side of it. */
function beside(objects: StudioFabricObject[], anchor: StudioFabricObject, side: 'left' | 'right') {
  const row = textboxes(objects).filter(
    (o) => o !== anchor && o.top === anchor.top && (side === 'right' ? o.left > anchor.left : o.left < anchor.left),
  )
  expect(row).toHaveLength(1)
  return row[0]!
}

/** Letter → meaning, as the puzzle page lists them. */
function meaningList(objects: StudioFabricObject[]): Map<string, string> {
  return new Map(letters(objects).map((o) => [clean(o.text).slice(0, 1), oneLine(clean(beside(objects, o, 'right').text))]))
}

// The key is built from `answerSourceObjects` (asserted below); the puzzle page
// deliberately carries no answer at all, hidden or not, so a letter cannot
// surface through an ungroup or a visibility toggle.
runGeneratorContractTests(workLingoTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: WL_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: WL_FIXTURE },
})

describe('work-lingo-match registry', () => {
  it('is registered once, in the word tab, with an answer page in black ink', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'work-lingo-match')).toHaveLength(1)
    const registered = getStudioTemplate('work-lingo-match')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(WL_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('work-lingo-match')).toBe(true)
  })

  it('asks only for the level, Classic by default', () => {
    expect(workLingoTemplate.configSchema.map((field) => field.key)).toEqual(['level'])
    expect(buildDefaultConfig(workLingoTemplate)).toMatchObject({ level: 'classic' })
  })

  it('carries one short instruction, or none', () => {
    expect(instructionFor(base)).toBe(wlInstruction())
    expect(instructionFor({ ...base, showInstructions: false })).toBe('')
  })
})

describe('work-lingo-match content gates', () => {
  it('accepts every fixture pair', () => {
    expect(fixturePairs().map((pair) => pair.phrase)).toEqual(WL_FIXTURE_PAIRS.map((pair) => pair.phrase))
  })

  it('never prints a pair the service did not check', () => {
    expect(selectWlPairs(WL_FIXTURE_PAIRS.map((pair) => ({ ...pair, verified: false })), { cap: 5 })).toEqual([])
    const { verified: _dropped, ...noMark } = WL_FIXTURE_PAIRS[0]!
    expect(normalizeWlPair(noMark)).toBeNull()
  })

  it('drops a pair of the wrong shape', () => {
    const good = WL_FIXTURE_PAIRS[0]!
    for (const change of [
      { phrase: '' },
      { phrase: 'ASAP' },
      { phrase: 'circle back' },
      { phrase: 'Circle back to the topic we raised in the meeting' },
      { meaning: 'Later' },
      { meaning: 'return to the topic later' },
      { meaning: 'Return to the "topic" later' },
      { meaning: 'Circle around to the topic later' },
      { meaning: 'Return to the topic once everybody in the room has had their say' },
    ]) {
      expect(normalizeWlPair({ ...good, ...change }), JSON.stringify(change)).toBeNull()
    }
  })

  it('refuses insensitive, crude, ageist or branded phrases', () => {
    for (const phrase of ['Drink the Kool-Aid', 'Low man on the totem pole', 'Put out to pasture', 'Happy hour', 'Dead in the water']) {
      expect(normalizeWlPair({ phrase, meaning: 'Something fitting to say here', verified: true }), phrase).toBeNull()
    }
  })

  it('treats one phrase in other words as a repeat, and phrases sharing a word as one family', () => {
    expect(phrasesRepeat('Back burner', 'Put it on the back burner')).toBe(true)
    expect(phrasesRepeat('Circling back', 'Circle back')).toBe(true)
    expect(phrasesRelated('Circle back', 'Back burner')).toBe(true)
    expect(phrasesRelated('Touch base', 'Move the needle')).toBe(false)
    expect(meaningsClash('Return to the topic later', 'Return to this topic at a later time')).toBe(true)
  })

  it('never lets two pairs a reader could confuse onto one page', () => {
    const lookalikes = [
      { phrase: 'Back burner', meaning: 'Set aside as a lower priority', verified: true },
      { phrase: 'Put a pin in it', meaning: 'Return to that topic later', verified: true },
      { phrase: 'Game plan', meaning: 'A strategy to touch every goal', verified: true },
    ]
    const kept = selectWlPairs([...WL_FIXTURE_PAIRS, ...lookalikes], { cap: 20 })
    expect(kept.map((pair) => pair.phrase)).toEqual(WL_FIXTURE_PAIRS.map((pair) => pair.phrase))
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) expect(pairsConflict(kept[i]!, kept[j]!)).toBe(false)
    }
  })

  it('drops phrases the book already prints', () => {
    const kept = selectWlPairs(WL_FIXTURE_PAIRS, { cap: 20, avoid: ['Circling back', 'touch base'] })
    expect(kept.map((pair) => pair.phrase)).not.toContain('Circle back')
    expect(kept.map((pair) => pair.phrase)).not.toContain('Touch base')
    expect(kept).toHaveLength(WL_FIXTURE_PAIRS.length - 2)
  })

  it('treats malformed replies as empty rather than throwing', () => {
    for (const raw of [undefined, null, 'nope', 42, [null, 'x', { phrase: 'Circle back' }]]) {
      expect(selectWlPairs(raw, { cap: 5 })).toEqual([])
    }
  })

  it('letters the meanings so no answer sits at its own phrase’s position', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const count of [5, 7, 10]) {
        const shown = letterWlPairs(count, seed)
        expect([...shown].sort((a, b) => a - b)).toEqual([...Array(count).keys()])
        expect(shown.every((pair, position) => pair !== position)).toBe(true)
      }
    }
    expect(letterWlPairs(8, 3)).toEqual(letterWlPairs(8, 3))
    expect(new Set([1, 2, 3, 4, 5].map((seed) => letterWlPairs(8, seed).join())).size).toBeGreaterThan(1)
  })
})

describe('work-lingo-match page', () => {
  it('prints what the form promises on every KDP trim and level, in large print, inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        for (const showTitle of [true, false]) {
          const config = { ...base, level, showTitle, title: showTitle ? WL_DEFAULT_TITLE : '' }
          const ctx = kdpCtx(w, h)
          const label = `${w}x${h} ${level} title=${showTitle}`
          const plan = wlWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT, level })!
          expect(plan, label).not.toBeNull()
          expect(plan.count, label).toBeGreaterThanOrEqual(MIN_PAIRS_PER_PAGE)
          expect(plan.count, label).toBeLessThanOrEqual(wlLevelSpec(level).maxPairs)
          expect(plan.metrics.font, label).toBeGreaterThanOrEqual(TEXT_FONT_MIN)

          const [page] = generate(config, ctx)
          expect(numbers(page!.objects), label).toHaveLength(plan.count)
          expect(letters(page!.objects), label).toHaveLength(plan.count)
          const note = wlPrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT, level })
          expect(note).toContain(`${plan.count} phrases to match a page`)
          expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)

          assertObjectsInSafeMargin(page!.objects, ctx)
          assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
        }
      }
    }
  })

  it('gives a letter page a fuller, larger puzzle than a small trim', () => {
    const plan = (w: number, h: number, level: (typeof LEVELS)[number]) =>
      wlWorstCasePlan({ page: kdpCtx(w, h), config: base, instruction: instructionFor(base), font: FONT, level })!
    expect(plan(8.5, 11, 'classic').count).toBe(10)
    expect(plan(8.5, 11, 'gentle').count).toBe(8)
    expect(plan(6, 9, 'classic').count).toBeGreaterThanOrEqual(6)
    expect(pxToPt(plan(6, 9, 'classic').metrics.font)).toBeGreaterThanOrEqual(16)
  })

  it('shows numbered phrases with empty boxes and lettered meanings — no answer anywhere, hidden or not', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const objects = page!.objects
    expect(harvestAnswers(objects)).toHaveLength(0)
    const phrases = numbers(objects).map((n) => oneLine(clean(beside(objects, n, 'right').text)))
    expect(phrases.every((phrase) => meaningOf.has(phrase))).toBe(true)
    // The meanings on the page are exactly the phrases' meanings, lettered A, B, C… in order.
    const list = meaningList(objects)
    expect([...list.keys()]).toEqual([...list.keys()].sort())
    expect([...list.values()].sort()).toEqual(phrases.map((phrase) => meaningOf.get(phrase)).sort())
    // Nothing on the page names a letter next to a phrase.
    expect(texts(objects).filter((t) => /^[A-Z]$/.test(t))).toHaveLength(0)
    const boxes = objects.filter((o) => o.type === 'rect' && o.width === o.height)
    expect(boxes).toHaveLength(phrases.length)
  })

  it('keys every phrase to the letter of its own meaning, with that exact meaning beneath', () => {
    for (const seed of [42, 7, 1234]) {
      for (const [w, h] of TRIMS) {
        const [page] = generate({ ...base, seed }, kdpCtx(w, h, WL_FIXTURE, seed))
        const puzzle = page!.objects
        const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
        const list = meaningList(puzzle)
        const puzzleNumbers = numbers(puzzle)
        const keyNumbers = numbers(key)
        expect(keyNumbers.map((o) => clean(o.text))).toEqual(puzzleNumbers.map((o) => clean(o.text)))

        puzzleNumbers.forEach((numberObj, i) => {
          const where = `${w}x${h} seed ${seed} #${i + 1}`
          const phrase = oneLine(clean(beside(puzzle, numberObj, 'right').text))
          const keyNumber = keyNumbers[i]!
          expect(oneLine(clean(beside(key, keyNumber, 'right').text)), where).toBe(phrase)
          const letter = clean(beside(key, keyNumber, 'left').text)
          // The letter on the key points at this phrase's meaning on the puzzle page…
          expect(list.get(letter), where).toBe(meaningOf.get(phrase))
          // …and the key prints that very meaning under the phrase.
          expect(texts(key), where).toContain(meaningOf.get(phrase))
        })

        // Letters are revealed on the key in bold — told apart without colour.
        const revealed = key.filter((o) => /^[A-Z]$/.test(clean(o.text)))
        expect(revealed).toHaveLength(puzzleNumbers.length)
        expect(revealed.every((o) => o.visible === true && o.fontWeight === 700)).toBe(true)
        expect(texts(key).some((t) => t === instructionFor(base))).toBe(false)
      }
    }
  })

  it('stamps its phrases so later pages can avoid them', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const labels = page!.objects
      .map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY])
      .filter((label): label is string => typeof label === 'string')
    expect(labels).toHaveLength(numbers(page!.objects).length)
    expect(labels.every((label) => meaningOf.has(label))).toBe(true)
  })

  it('writes an error page, not a broken page, when content is missing or too thin', () => {
    for (const remoteData of [undefined, null, { pairs: [] }, { pairs: 'nope' }]) {
      const [page] = generate(base, { ...STUDIO_TEST_CTX, remoteData })
      expect(page!.answerSourceObjects).toBeUndefined()
      expect(texts(page!.objects)).toContain(WL_AI_EMPTY_MESSAGE)
    }
    const thin = { pairs: WL_FIXTURE_PAIRS.slice(0, MIN_PAIRS_PER_PAGE - 1) }
    const [page] = generate(base, kdpCtx(8.5, 11, thin))
    expect(page!.answerSourceObjects).toBeUndefined()
    expect(texts(page!.objects)).toContain(WL_BUILD_FAILED_MESSAGE)
  })
})

describe('work-lingo-match preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = wlWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT, level: 'classic' })!
  const fitted = fitWlPairs(fixturePairs(), plan, FONT, 42)!

  it('passes a clean page', () => {
    expect(runWlKdpPreflight(fitted)).toMatchObject({ ok: true })
  })

  it('refuses a meaning set under the wrong phrase', () => {
    const [first, second, ...rest] = fitted.pairs
    const swapped = { ...first!, keyLines: second!.keyLines }
    expect(runWlKdpPreflight({ pairs: [swapped, second!, ...rest], plan: fitted.plan }).ok).toBe(false)
  })

  it('refuses a letter used twice, or left at its own phrase’s position', () => {
    const [first, second, ...rest] = fitted.pairs
    const twice = runWlKdpPreflight({ pairs: [first!, { ...second!, letter: first!.letter }, ...rest], plan: fitted.plan })
    expect(twice.ok).toBe(false)
    const own = fitted.pairs.map((pair) => ({ ...pair }))
    const holder = own.findIndex((pair) => pair.letter === 'A')
    ;[own[0]!.letter, own[holder]!.letter] = ['A', own[0]!.letter]
    expect(runWlKdpPreflight({ pairs: own, plan: fitted.plan }).ok).toBe(false)
  })

  it('refuses the same pair twice and a page too thin to be a puzzle', () => {
    const [first, ...rest] = fitted.pairs
    expect(runWlKdpPreflight({ pairs: [first!, first!, ...rest.slice(1)], plan: fitted.plan }).ok).toBe(false)
    const few = fitted.pairs.slice(0, MIN_PAIRS_PER_PAGE - 1)
    expect(runWlKdpPreflight({ pairs: few, plan: { ...plan, count: few.length } }).ok).toBe(false)
  })
})
