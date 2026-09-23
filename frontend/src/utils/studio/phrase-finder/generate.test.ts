import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  assertGeneratorEntropy,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { STUDIO_INK } from '@/constants/studio.constants'
import {
  MAX_CLUE_CHARS,
  MAX_MARKS,
  MAX_WORD_LETTERS,
  MIN_CLUE_CHARS,
  bandFor,
  clueGivesAnswerAway,
  isValidClue,
  isValidPhrase,
  markCount,
  normalizeClue,
  revealCapacity,
  selectAiItems,
  strippedWords,
  worstCaseItem,
  worstCasePhrase,
} from './content'
import { phraseFinderTemplate } from './generate'
import { phraseFinderFixtureResponse } from './fixture'
import {
  MAX_CLUE_LINES,
  MIN_CLUE_PT,
  SLOT_MIN_W,
  phraseFinderBodyField,
  phraseFinderMetrics,
  phraseFinderPageLock,
  phraseFinderWorstCasePlan,
  planPhraseFinderPage,
  pxToPt,
  rowWidth,
  toPlanItems,
  wrapPhrase,
} from './layout'
import { PHRASE_FINDER_LEVELS, parsePhraseFinderLevel } from './levels'
import {
  PHRASE_FINDER_MARKS,
  hasOnlySupportedCharacters,
  letterAt,
  letterCount,
  maskedText,
  normalizePhrase,
  phraseFromModel,
  phraseWords,
  toPhraseModel,
} from './phrase'
import {
  LONG_WORD_LETTERS,
  MAX_REVEALED_SHARE,
  MIN_HIDDEN_LETTERS,
  MIN_REVEALED_SHARE,
  allocateWordReveals,
  planReveals,
  revealBudget,
  revealPositionsInWord,
  revealedInWord,
  wordRevealCap,
} from './reveal'
import { runPhraseFinderKdpPreflight } from './kdp-preflight'

const remoteData = phraseFinderFixtureResponse()

const config = (overrides: StudioConfig = {}): StudioConfig => ({
  ...buildDefaultConfig(phraseFinderTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  ...overrides,
})

/** A real KDP interior page: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'phrase-finder-test',
  remoteData,
})

const TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [8, 10],
  [8.5, 11],
]

function flatten(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const obj of objects) {
    if (String(obj.type).toLowerCase() === 'group' && obj.objects) {
      out.push(...flatten(obj.objects))
      continue
    }
    out.push(obj)
  }
  return out
}

function draw(
  overrides: StudioConfig = {},
  ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData },
) {
  resetObjectCounter()
  return phraseFinderTemplate.generate(config(overrides), ctx)
}

runGeneratorContractTests(phraseFinderTemplate, {
  contextOverrides: { remoteData },
})

assertGeneratorEntropy(phraseFinderTemplate, {
  seeds: 40,
  // The fixture holds six phrases per band and the page prints two or three of
  // them, so the pool of distinct pages is the orderings of that fixture, not
  // the seed space. What entropy has to prove here is that the *given letters*
  // move with the seed — a page that always hands over the same letters would
  // repeat itself through a book however many phrases it drew from.
  minDistinctRatio: 0.5,
  contextOverrides: { remoteData },
})

describe('phrase normalization', () => {
  it('uppercases and keeps only the marks the page can set', () => {
    expect(normalizePhrase("Don't rush; the kettle is on!")).toBe(
      "DON'T RUSH, THE KETTLE IS ON!",
    )
  })

  it('folds the typography a writer reaches for onto the page marks', () => {
    expect(normalizePhrase('A well—earned rest…')).toBe('A WELL-EARNED REST.')
    expect(normalizePhrase('It’s time')).toBe("IT'S TIME")
  })

  it('splits on characters the page cannot set rather than welding words', () => {
    expect(normalizePhrase('DAY 2 OF REST')).toBe('DAY OF REST')
  })

  it('never opens with a mark, stacks marks, or leaves one against a space', () => {
    expect(normalizePhrase('  ,,  the long way ,, round ..')).toBe(
      'THE LONG WAY, ROUND.',
    )
  })

  it('drops an inner mark with no letter after it', () => {
    // "WELL-" would print as a word the page cut in half.
    expect(normalizePhrase('a well- earned rest')).toBe('A WELL EARNED REST')
  })

  it('accepts only phrases made of supported characters', () => {
    expect(hasOnlySupportedCharacters("DON'T GO, IT IS EARLY")).toBe(true)
    expect(hasOnlySupportedCharacters('A WELL-EARNED REST.')).toBe(true)
    expect(hasOnlySupportedCharacters('DAY 2')).toBe(false)
    expect(hasOnlySupportedCharacters('TWO  SPACES')).toBe(false)
  })

  it('refuses a mark drawn where a solver would read it as a blank', () => {
    // No letter to its left: the mark opens a word.
    expect(hasOnlySupportedCharacters("GO 'ROUND")).toBe(false)
    // An inner mark with nothing after it: a word the page cut in half.
    expect(hasOnlySupportedCharacters('A WELL- EARNED REST')).toBe(false)
    // An end mark mid-word: it breaks the word count the row is read by.
    expect(hasOnlySupportedCharacters('A RE.ST NOW')).toBe(false)
    // A word with no letters in it at all.
    expect(hasOnlySupportedCharacters('A REST , NOW')).toBe(false)
  })

  it('names every mark it will set, and sets no other', () => {
    expect([...PHRASE_FINDER_MARKS].sort().join('')).toBe("!'-,.?".split('').sort().join(''))
  })
})

describe('the phrase model', () => {
  const model = toPhraseModel("DON'T RUSH, THE WELL-EARNED REST")

  it('reads back as the phrase it was built from', () => {
    expect(phraseFromModel(model)).toBe(model.text)
  })

  it('keeps an inner mark inside its word and an end mark on its own', () => {
    expect(model.words.map((word) => word.letters)).toEqual([
      'DONT',
      'RUSH',
      'THE',
      'WELLEARNED',
      'REST',
    ])
  })

  it('counts marks as neither letters nor blanks', () => {
    expect(model.letterCount).toBe(letterCount(model.text))
    expect(maskedText(model, new Set()).replace(/[^_]/g, '').length).toBe(
      model.letterCount,
    )
  })

  it('addresses every letter by its index in the phrase', () => {
    for (let i = 0; i < model.letterCount; i++) {
      expect(letterAt(model, i)).toMatch(/^[A-Z]$/)
    }
    expect(letterAt(model, model.letterCount)).toBe('')
  })
})

describe('content gates', () => {
  it('accepts the fixture and rejects what the page cannot set', () => {
    for (const item of remoteData.items) {
      expect(isValidPhrase(normalizePhrase(item.text))).toBe(true)
    }
    // One long word is never broken across rows, so it cannot outrun the column.
    expect(isValidPhrase(`${'N'.repeat(MAX_WORD_LETTERS + 1)} IS A LONG DAY NOW HERE`))
      .toBe(false)
  })

  it('measures where a phrase could put its given letters', () => {
    // `reveal.ts` will not hand any word more than half its letters, so a
    // phrase of two-letter words has nowhere to spend a budget at all. The word
    // bands make that phrase unreachable today — which is why it is also
    // refused on word count here — but the capacity measure is what would catch
    // it if a band ever widened.
    const allShort = Array.from({ length: 12 }, () => 'IT').join(' ')
    expect(revealCapacity(allShort)).toBe(0)
    expect(isValidPhrase(allShort)).toBe(false)
    // A phrase with real words has room, and it is measured per word.
    // THE 1, AFTERNOON 4, IS 0, FOR 1, GARDENING 4, AND 1, A 0, NAP 1.
    expect(revealCapacity('THE AFTERNOON IS FOR GARDENING AND A NAP')).toBe(12)
  })

  it('caps the marks one phrase may carry', () => {
    const marky = "IT'S A DAY, A REST, A WALK, AND A GOOD LONG SIT DOWN"
    expect(markCount(marky)).toBeGreaterThan(MAX_MARKS)
    expect(isValidPhrase(marky)).toBe(false)
  })

  it('drops duplicates however differently they punctuate', () => {
    const picked = selectAiItems(
      [
        { text: 'EVERY DAY OF THE WEEK IS A SATURDAY', clue: 'No working Monday now' },
        {
          text: 'EVERY DAY OF THE WEEK IS A SATURDAY!',
          clue: 'The same thought, punctuated',
        },
      ],
      { count: 3, length: 'short' },
    )
    expect(picked).toHaveLength(1)
  })

  it('drops copy that has no business in a book sold on KDP', () => {
    const picked = selectAiItems(
      [
        {
          text: 'A QUIET WALK WITH DISNEY IS THE BEST PART OF THE DAY',
          clue: 'An afternoon stroll somewhere famous',
        },
      ],
      { count: 3, length: 'medium' },
    )
    expect(picked).toEqual([])
  })

  it('worst case is a phrase the gates would themselves accept', () => {
    for (const level of PHRASE_FINDER_LEVELS) {
      const probe = worstCasePhrase(level.length)
      const band = bandFor(level.length)
      expect(isValidPhrase(probe, level.length)).toBe(true)
      expect(letterCount(probe)).toBe(band.maxLetters)
      expect(markCount(probe)).toBeLessThanOrEqual(MAX_MARKS)
      // And its clue fills the budget a real one is held to, so the page is
      // measured against the tallest block a writer could send back.
      expect(worstCaseItem(level.length).clue.length).toBeGreaterThan(
        MAX_CLUE_CHARS - 10,
      )
      expect(worstCaseItem(level.length).clue.length).toBeLessThanOrEqual(
        MAX_CLUE_CHARS,
      )
    }
  })
})

describe('the clue gates', () => {
  const PHRASE = 'A GARDEN ASKS ONLY THAT YOU TURN UP AND THEN SIT DOWN'

  it('carries every fixture clue onto the page it belongs to', () => {
    for (const item of remoteData.items) {
      expect(isValidClue(item.clue, normalizePhrase(item.text))).toBe(true)
    }
  })

  it('refuses a saying that arrived with no clue to solve it from', () => {
    // The failure this game is sold against: blanks, a third of the letters,
    // and a wording nobody could name.
    expect(isValidClue('', PHRASE)).toBe(false)
    expect(isValidClue('Rest', PHRASE)).toBe(false)
    expect(
      selectAiItems([{ text: PHRASE, clue: '' }], { count: 1, length: 'medium' }),
    ).toEqual([])
  })

  it('refuses a clue longer than the column it prints in', () => {
    const long = 'W'.repeat(MAX_CLUE_CHARS + 1)
    expect(long.length).toBeGreaterThan(MIN_CLUE_CHARS)
    expect(isValidClue(long, PHRASE)).toBe(false)
  })

  it('refuses a clue that prints a word of its own saying', () => {
    // GARDEN is on the row as blanks; "gardening" above them hands it over,
    // and the whole family goes with it.
    expect(clueGivesAnswerAway('Gardening jobs for a slow morning', PHRASE)).toBe(true)
    expect(clueGivesAnswerAway('Turning up is most of it', PHRASE)).toBe(true)
    // Function words are not protected: a clue cannot avoid THE and AND.
    expect(clueGivesAnswerAway('What the vegetable patch expects of you', PHRASE)).toBe(
      false,
    )
  })

  it('sets a clue the way the page prints it', () => {
    expect(normalizeClue('  "what the patch expects of you."  ')).toBe(
      'What the patch expects of you',
    )
    expect(normalizeClue(undefined)).toBe('')
  })

  it('refuses one clue used for two sayings on a page', () => {
    const picked = selectAiItems(
      [
        { text: PHRASE, clue: 'What the vegetable patch expects of you' },
        {
          text: 'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
          clue: 'What the vegetable patch expects of you',
        },
      ],
      { count: 3, length: 'medium' },
    )
    expect(picked).toHaveLength(1)
  })
})

describe('the letter reveal', () => {
  const rng = () => createRng(2024)

  it('never hands over a word, and always leaves it two blanks', () => {
    expect(wordRevealCap(1)).toBe(0)
    expect(wordRevealCap(2)).toBe(0)
    expect(wordRevealCap(3)).toBe(1)
    expect(wordRevealCap(4)).toBe(2)
    expect(wordRevealCap(9)).toBe(4)
    for (let n = 1; n <= 12; n++) {
      expect(n - wordRevealCap(n)).toBeGreaterThanOrEqual(Math.min(n, 2))
    }
  })

  it('keeps the budget inside the fairness band', () => {
    expect(revealBudget(40, 0.26)).toBeLessThanOrEqual(Math.floor(40 * MAX_REVEALED_SHARE))
    // A phrase must keep enough blanks to still be solved rather than read.
    expect(revealBudget(20, 0.9)).toBeLessThanOrEqual(20 - MIN_HIDDEN_LETTERS)
    expect(revealBudget(0, 0.3)).toBe(0)
  })

  it('serves the long words before the short ones', () => {
    const model = toPhraseModel('THE AFTERNOON IS FOR GARDENING AND A NAP')
    const counts = allocateWordReveals(model.words, 3)
    const byWord = new Map(
      model.words.map((word, i) => [word.letters, counts[i]!] as const),
    )
    expect(byWord.get('AFTERNOON')).toBeGreaterThan(0)
    expect(byWord.get('GARDENING')).toBeGreaterThan(0)
    // Two-letter and shorter words are never given a letter at all.
    expect(byWord.get('A')).toBe(0)
    expect(byWord.get('IS')).toBe(0)
  })

  it('spreads a budget across words instead of pouring it into one', () => {
    const model = toPhraseModel('GARDENING SUITS THE SLOWER MORNINGS NOW')
    const counts = allocateWordReveals(model.words, 4)
    expect(counts.filter((count) => count > 0).length).toBe(4)
    expect(Math.max(...counts)).toBe(1)
  })

  it('never puts two given letters side by side in one word', () => {
    for (let n = 4; n <= 12; n++) {
      const word = toPhraseModel('A'.repeat(n)).words[0]!
      const positions = revealPositionsInWord(word, wordRevealCap(n), rng())
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(1)
      }
    }
  })

  it('spends its first letter inside a long word, not on its edges', () => {
    const word = toPhraseModel('GARDENING').words[0]!
    for (let seed = 1; seed <= 40; seed++) {
      const [only] = revealPositionsInWord(word, 1, createRng(seed))
      expect(only).toBeGreaterThan(0)
      expect(only).toBeLessThan(word.letters.length - 1)
    }
  })

  it('gives every long word a foothold and no word its whole self', () => {
    for (const level of PHRASE_FINDER_LEVELS) {
      for (const item of remoteData.items) {
        const model = toPhraseModel(normalizePhrase(item.text))
        const revealed = planReveals(model, level.revealShare, rng())
        const share = revealed.size / model.letterCount

        expect(share).toBeLessThanOrEqual(MAX_REVEALED_SHARE)
        expect(model.letterCount - revealed.size).toBeGreaterThanOrEqual(
          MIN_HIDDEN_LETTERS,
        )
        for (const word of model.words) {
          const given = revealedInWord(word, revealed)
          expect(given).toBeLessThanOrEqual(wordRevealCap(word.letters.length))
          if (word.letters.length >= LONG_WORD_LETTERS && revealed.size > 0) {
            expect(given).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('gives a way in on every phrase the gates let through', () => {
    for (const level of PHRASE_FINDER_LEVELS) {
      for (const item of remoteData.items) {
        const model = toPhraseModel(normalizePhrase(item.text))
        const revealed = planReveals(model, level.revealShare, rng())
        expect(revealed.size).toBeGreaterThanOrEqual(
          Math.ceil(model.letterCount * MIN_REVEALED_SHARE),
        )
      }
    }
  })

  it('moves its letters with the seed, so two pages differ', () => {
    const model = toPhraseModel(normalizePhrase(remoteData.items[6]!.text))
    const masks = new Set(
      Array.from({ length: 12 }, (_, i) =>
        maskedText(model, planReveals(model, 0.26, createRng(i + 1))),
      ),
    )
    expect(masks.size).toBeGreaterThan(1)
  })

  it('gives fewer letters as the level gets harder', () => {
    const model = toPhraseModel(normalizePhrase(remoteData.items[6]!.text))
    const sizes = PHRASE_FINDER_LEVELS.map(
      (level) => planReveals(model, level.revealShare, rng()).size,
    )
    expect(sizes[0]).toBeGreaterThan(sizes[2]!)
  })
})

describe('wrapping', () => {
  const metrics = phraseFinderMetrics(SLOT_MIN_W)

  it('never breaks a word across rows and never overruns the column', () => {
    const model = toPhraseModel(normalizePhrase(remoteData.items[14]!.text))
    const lines = wrapPhrase(model, metrics, 420)!
    expect(lines.flat().map((word) => word.letters)).toEqual(
      model.words.map((word) => word.letters),
    )
    for (const line of lines) expect(rowWidth(line, metrics)).toBeLessThanOrEqual(420)
  })

  it('refuses rather than breaking a word wider than the column', () => {
    const model = toPhraseModel('GARDENING IS GOOD FOR YOU AND FOR THE DAY')
    expect(wrapPhrase(model, metrics, metrics.slotW * 4)).toBeNull()
  })

  it('squares the rows off instead of leaving one word stranded', () => {
    const model = toPhraseModel('A HOUSE FULL OF BOOKS AND A POT OF TEA IS ALL A DAY NEEDS')
    const band = 420
    const lines = wrapPhrase(model, metrics, band)!
    const widths = lines.map((line) => rowWidth(line, metrics))
    // The last row is never a lone scrap under a full one: the balance pass
    // pulls words back down until the rows are as even as the count allows.
    expect(Math.min(...widths)).toBeGreaterThan(Math.max(...widths) * 0.4)
  })
})

describe('the printed page', () => {
  it('keeps every object inside the safe area on every KDP trim', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PHRASE_FINDER_LEVELS) {
        const ctx = kdpCtx(w, h)
        resetObjectCounter()
        const pages = phraseFinderTemplate.generate(config({ level: level.id }), ctx)
        for (const page of pages) {
          assertObjectsInSafeMargin(page.objects, ctx)
          assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects, ctx)
        }
      }
    }
  })

  it('never sets a blank below the size a hand can write in', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PHRASE_FINDER_LEVELS) {
        const plan = phraseFinderWorstCasePlan({
          level,
          page: kdpCtx(w, h),
          config: config({ level: level.id, title: 'Game 1' }),
          instruction: 'x',
          font: 'PT Serif',
        })
        if (!plan) continue
        expect(plan.metrics.slotW).toBeGreaterThanOrEqual(SLOT_MIN_W)
      }
    }
  })

  it('prints a page on every trim the app sells, at every level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PHRASE_FINDER_LEVELS) {
        const pages = draw({ level: level.id }, kdpCtx(w, h))
        const drawn = flatten(pages[0]!.objects)
        // An error card is a single line of prose; a real page carries rules.
        expect(drawn.some((obj) => obj.type === 'rect')).toBe(true)
      }
    }
  })

  it('draws one writing rule for every letter, and none under a mark', () => {
    const ctx = kdpCtx(8.5, 11)
    const pages = draw({ level: 'classic' }, ctx)
    const drawn = flatten(pages[0]!.objects)
    const rules = drawn.filter((obj) => obj.type === 'rect')
    const letters = drawn.filter(
      (obj) => obj.type === 'textbox' && /^[A-Z]$/.test(String(obj.text ?? '')),
    )
    expect(rules.length).toBe(letters.length)
  })

  it('shows the given letters and the punctuation, and hides the rest', () => {
    const ctx = kdpCtx(8.5, 11)
    const pages = draw({ level: 'classic' }, ctx)
    const drawn = flatten(pages[0]!.objects)
    const marks = drawn.filter(
      (obj) => obj.type === 'textbox' && /^['\-,.?!]$/.test(String(obj.text ?? '')),
    )
    for (const mark of marks) expect(mark.visible).not.toBe(false)

    const hidden = harvestAnswers(pages[0]!.objects)
    expect(hidden.length).toBeGreaterThan(0)
    for (const obj of hidden) {
      expect(obj.visible).toBe(false)
      expect(String(obj.text ?? '')).toMatch(/^[A-Z]$/)
    }
  })

  it('prints a clue above the blanks of every puzzle', () => {
    // The page is a row of blanks and a third of a phrase nobody has read
    // before. Without the line above it there is no answer a solver could
    // reach — only the one the key happens to print.
    const pages = draw({ level: 'classic' }, kdpCtx(8.5, 11))
    const clues = new Set(remoteData.items.map((entry) => entry.clue))
    const groups = pages[0]!.objects.filter(
      (obj) => String(obj.type).toLowerCase() === 'group',
    )
    expect(groups.length).toBeGreaterThan(0)

    for (const group of groups) {
      const parts = flatten([group])
      const rules = parts.filter((obj) => obj.type === 'rect')
      if (rules.length === 0) continue
      const clue = parts.find((obj) =>
        clues.has(String(obj.text ?? '').replace(/\s+/g, ' ')),
      )
      expect(clue).toBeDefined()
      // Above the first writing rule, so it is read before it is answered.
      expect(Number(clue!.top)).toBeLessThan(
        Math.min(...rules.map((rule) => Number(rule.top))),
      )
    }
  })

  it('never sets a clue below the size this book is sold at', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PHRASE_FINDER_LEVELS) {
        const plan = phraseFinderWorstCasePlan({
          level,
          page: kdpCtx(w, h),
          config: config({ level: level.id }),
          instruction: 'x',
          font: 'PT Serif',
        })
        if (!plan) continue
        expect(pxToPt(plan.metrics.clueFont)).toBeGreaterThanOrEqual(MIN_CLUE_PT)
      }
    }
  })

  it('breaks a clue into no more lines than the page reserved for it', () => {
    // The budget in `MAX_CLUE_CHARS` is a promise about the narrowest interior
    // this app sells, and this is where it is kept or broken.
    for (const [w, h] of TRIMS) {
      for (const level of PHRASE_FINDER_LEVELS) {
        const ctx = kdpCtx(w, h)
        const cfg = config({ level: level.id })
        const promised = phraseFinderWorstCasePlan({
          level,
          page: ctx,
          config: cfg,
          instruction: 'x',
          font: 'PT Serif',
        })
        if (!promised) continue
        const items = selectAiItems(remoteData.items, {
          count: level.targetPuzzles,
          length: level.length,
        })
        const plan = planPhraseFinderPage({
          field: phraseFinderBodyField(ctx, cfg, 'x'),
          items: toPlanItems(items),
          target: promised.puzzleCount,
          spec: { fontFamily: 'PT Serif' },
          lock: phraseFinderPageLock(promised),
        })
        expect(plan).not.toBeNull()
        for (const layout of plan!.layouts) {
          expect(layout.clueLines.length).toBeGreaterThan(0)
          expect(layout.clueLines.length).toBeLessThanOrEqual(MAX_CLUE_LINES)
        }
      }
    }
  })

  it('tells the given letters apart by ink alone, never by colour', () => {
    const drawn = flatten(draw({ level: 'classic' }, kdpCtx(8.5, 11))[0]!.objects)
    const letters = drawn.filter(
      (obj) => obj.type === 'textbox' && /^[A-Z]$/.test(String(obj.text ?? '')),
    )
    expect(letters.length).toBeGreaterThan(0)
    for (const letter of letters) expect(letter.fill).toBe(STUDIO_INK)
  })

  it('holds the same number of puzzles at the same pitch across a book run', () => {
    const ctx = (seed: number) => kdpCtx(6, 9, seed)
    const shapes = new Set(
      [1, 2, 3, 4, 5].map((seed) => {
        const drawn = flatten(draw({ level: 'classic' }, ctx(seed))[0]!.objects)
        const sizes = new Set(
          drawn
            .filter((obj) => obj.type === 'textbox' && /^[A-Z]$/.test(String(obj.text ?? '')))
            .map((obj) => obj.fontSize),
        )
        return [...sizes].sort().join(',')
      }),
    )
    expect(shapes.size).toBe(1)
  })
})

describe('the solution page', () => {
  it('spells the phrases exactly, in the slots the blanks were in', () => {
    const ctx = kdpCtx(6, 9)
    resetObjectCounter()
    const pages = phraseFinderTemplate.generate(config({ level: 'classic' }), ctx)
    const page = pages[0]!
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_INK, {
      contentWidth: ctx.pageWidth,
    })

    const puzzleLetters = flatten(page.objects).filter(
      (obj) => obj.type === 'textbox' && /^[A-Z'\-,.?!]$/.test(String(obj.text ?? '')),
    )
    const keyLetters = flatten(key).filter(
      (obj) => obj.type === 'textbox' && /^[A-Z'\-,.?!]$/.test(String(obj.text ?? '')),
    )

    // Same cells, same order, every one of them visible on the key.
    expect(keyLetters.map((obj) => obj.text)).toEqual(
      puzzleLetters.map((obj) => obj.text),
    )
    for (const obj of keyLetters) expect(obj.visible).not.toBe(false)

    // And they read as the phrases themselves, not as a different set of words.
    const spelled = keyLetters.map((obj) => String(obj.text)).join('')
    const items = selectAiItems(remoteData.items, { count: 3, length: 'medium' })
    const printed = items
      .slice(0, Math.ceil(spelled.length / 10))
      .map((item) => item.text.replace(/ /g, ''))
    expect(printed.some((phrase) => spelled.startsWith(phrase))).toBe(true)
  })

  it('keeps the clues, so a reader sees what each row answered', () => {
    const pages = draw({ level: 'classic' }, kdpCtx(6, 9))
    const solution = flatten(pages[0]!.answerSourceObjects!)
    const clues = new Set(remoteData.items.map((entry) => entry.clue))
    expect(
      solution.some((obj) => clues.has(String(obj.text ?? '').replace(/\s+/g, ' '))),
    ).toBe(true)
  })

  it('drops the how-to copy from the key but keeps the rows', () => {
    const pages = draw({ level: 'classic' }, kdpCtx(6, 9))
    const solution = flatten(pages[0]!.answerSourceObjects!)
    expect(solution.some((obj) => /^Each line of blanks/.test(String(obj.text ?? '')))).toBe(
      false,
    )
    expect(solution.some((obj) => obj.type === 'rect')).toBe(true)
  })
})

describe('the preflight gate', () => {
  const metrics = phraseFinderMetrics(SLOT_MIN_W)
  const puzzleOf = (
    phrase: string,
    revealed: Iterable<number>,
    clue = 'Something worth saying about the day',
  ) => ({
    model: toPhraseModel(normalizePhrase(phrase)),
    clue,
    revealed: new Set(revealed),
  })

  it('passes the pages the generator actually builds', () => {
    for (const level of PHRASE_FINDER_LEVELS) {
      const items = selectAiItems(remoteData.items, {
        count: level.targetPuzzles,
        length: level.length,
      }).slice(0, level.targetPuzzles)
      const puzzles = items.map((item, i) => {
        const model = toPhraseModel(item.text)
        return {
          model,
          clue: item.clue,
          revealed: planReveals(model, level.revealShare, createRng(i + 7)),
        }
      })
      const result = runPhraseFinderKdpPreflight({
        puzzles,
        length: level.length,
        metrics,
      })
      expect(result.errors).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('refuses a given letter that does not sit on a letter of its phrase', () => {
    const puzzle = puzzleOf('THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN', [999])
    const result = runPhraseFinderKdpPreflight({
      puzzles: [puzzle],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a page that gave the phrase away', () => {
    const model = toPhraseModel(
      normalizePhrase('THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN'),
    )
    const everything = new Set(
      Array.from({ length: model.letterCount }, (_, i) => i),
    )
    const result = runPhraseFinderKdpPreflight({
      puzzles: [{ model, clue: 'Every letter handed over', revealed: everything }],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a page with no way into it', () => {
    const result = runPhraseFinderKdpPreflight({
      puzzles: [puzzleOf('THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN', [])],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a long word left without a single letter', () => {
    const model = toPhraseModel(
      normalizePhrase('THE AFTERNOON BELONGS TO THE GARDEN AND TO NOBODY ELSE'),
    )
    // Every given letter poured into the front of the phrase: legal per word,
    // and it leaves the words that carry the sense as unbroken runs of blanks.
    const clumped = new Set([1, 5, 6, 10])
    const result = runPhraseFinderKdpPreflight({
      puzzles: [{ model, clue: 'Where the budget went wrong', revealed: clumped }],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/long word/i)
  })

  it('refuses the same phrase, or a rewording of it, twice on one page', () => {
    const a = puzzleOf('EVERY DAY OF THE WEEK IS A SATURDAY', [2, 9])
    const result = runPhraseFinderKdpPreflight({
      puzzles: [a, a],
      length: 'short',
      metrics,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a puzzle whose clue went missing on the way to the page', () => {
    const result = runPhraseFinderKdpPreflight({
      puzzles: [puzzleOf('EVERY DAY OF THE WEEK IS A SATURDAY', [2, 9, 15], '')],
      length: 'short',
      metrics,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/clue/i)
  })

  it('refuses a clue that prints a word of the phrase it hides', () => {
    const result = runPhraseFinderKdpPreflight({
      puzzles: [
        puzzleOf(
          'A GARDEN ASKS ONLY THAT YOU TURN UP AND THEN SIT DOWN',
          [2, 9, 15, 22, 28],
          'Gardening jobs for a slow morning',
        ),
      ],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/clue/i)
  })

  it('refuses one clue printed over two puzzles', () => {
    const shared = 'The same question, asked twice'
    const result = runPhraseFinderKdpPreflight({
      puzzles: [
        puzzleOf('EVERY DAY OF THE WEEK IS A SATURDAY', [2, 9, 15], shared),
        puzzleOf('THE GARDEN KEEPS ITS OWN QUIET HOURS', [3, 10, 16], shared),
      ],
      length: 'short',
      metrics,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/clue/i)
  })

  it('refuses blanks too narrow to write in', () => {
    const result = runPhraseFinderKdpPreflight({
      puzzles: [puzzleOf('EVERY DAY OF THE WEEK IS A SATURDAY', [2, 9, 15])],
      length: 'short',
      metrics: phraseFinderMetrics(SLOT_MIN_W - 1),
    })
    expect(result.ok).toBe(false)
  })
})

describe('when the page cannot be built', () => {
  it('prints a plain explanation rather than a broken puzzle', () => {
    resetObjectCounter()
    const pages = phraseFinderTemplate.generate(config(), {
      ...STUDIO_TEST_CTX,
      remoteData: { items: ['NO'] },
    })
    const text = flatten(pages[0]!.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).toMatch(/could not write enough clear retirement phrases/i)
  })

  it('says which lever to pull when the trim is too small', () => {
    const tiny: StudioGenerateContext = {
      pageWidth: 240,
      pageHeight: 300,
      margin: { top: 24, right: 24, bottom: 24, left: 24 },
      seed: 42,
      instanceId: 'tiny',
      remoteData,
    }
    resetObjectCounter()
    const pages = phraseFinderTemplate.generate(config({ level: 'challenging' }), tiny)
    const text = flatten(pages[0]!.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).toMatch(/too small/i)
  })

  it('never plans a page from phrases it could not lay out', () => {
    const plan = planPhraseFinderPage({
      field: { left: 0, top: 0, width: 40, height: 400 },
      items: toPlanItems([
        { text: 'EVERY DAY OF THE WEEK IS A SATURDAY', clue: 'No working Monday now' },
      ]),
      target: 1,
      spec: { fontFamily: 'PT Serif' },
    })
    expect(plan).toBeNull()
  })
})

describe('the form', () => {
  it('asks two questions and nothing about the page', () => {
    const keys = phraseFinderTemplate.configSchema.map((field) => field.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level'])
  })

  it('reports what the chosen level prints on the trim in Settings', () => {
    const level = phraseFinderTemplate.configSchema.find((f) => f.key === 'level')!
    for (const [w, h] of TRIMS) {
      const note = level.helpWhen!(config(), kdpCtx(w, h))
      expect(note).toMatch(/phrases? a page|too small/i)
    }
  })

  it('blocks generate when a custom theme is left blank', () => {
    expect(
      phraseFinderTemplate.validateConfig!(config({ theme: 'custom', customTheme: '' })),
    ).not.toBeNull()
  })
})

describe('parsePhraseFinderLevel', () => {
  it('keeps a sheet saved against the older length field on its own level', () => {
    expect(parsePhraseFinderLevel({ length: 'long' }).id).toBe('challenging')
    expect(parsePhraseFinderLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parsePhraseFinderLevel({}).id).toBe('classic')
  })
})

describe('phraseWords / strippedWords', () => {
  it('reads a word as its letters plus the marks bound to it', () => {
    expect(phraseWords("DON'T GO, YET")).toEqual(["DON'T", 'GO,', 'YET'])
    expect(strippedWords("DON'T GO, YET")).toBe('DONT GO YET')
  })
})
