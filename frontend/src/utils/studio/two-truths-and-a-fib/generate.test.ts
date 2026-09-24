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
import { twoTruthsFibTemplate, validateTtfConfig } from './generate'
import { instructionFor } from './config'
import {
  TTF_AI_EMPTY_MESSAGE,
  TTF_DEFAULT_TITLE,
  TTF_LETTERS,
  normalizeStatement,
  normalizeTtfSet,
  placeTtfSets,
  selectTtfSets,
  statementsRepeat,
  ttfExplanation,
  type TtfSet,
} from './content'
import { fitTtfSets } from './fit'
import { runTtfKdpPreflight } from './kdp-preflight'
import {
  MAX_SETS_PER_PAGE,
  STATEMENT_FONT_MIN,
  breakStatement,
  pxToPt,
  ttfPrintNote,
  ttfWorstCasePlan,
} from './layout'
import { TTF_FIXTURE, TTF_FIXTURE_ITEMS } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(twoTruthsFibTemplate),
  showTitle: true,
  title: TTF_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = TTF_FIXTURE, seed = 42): StudioGenerateContext => ({
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

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return twoTruthsFibTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => clean(o.text)).filter(Boolean)
const oneLine = (text: string) => text.replace(/\n/g, ' ')
const visible = (objects: StudioFabricObject[]) => objects.filter((o) => o.visible !== false)

const fixtureSets = () => selectTtfSets(TTF_FIXTURE_ITEMS, { cap: 10 })
const allStatements = TTF_FIXTURE_ITEMS.flatMap((item) => [...item.truths, item.fib])
const fibs = new Set(TTF_FIXTURE_ITEMS.map((item) => item.fib))

// The fixture is fixed; the seed moves which letter each fib lands on.
runGeneratorContractTests(twoTruthsFibTemplate, {
  configOverrides: { showTitle: true, title: TTF_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: TTF_FIXTURE },
})

describe('two-truths-and-a-fib registry', () => {
  it('is registered once, in the word tab, with an answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'two-truths-and-a-fib')).toHaveLength(1)
    const registered = getStudioTemplate('two-truths-and-a-fib')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(TTF_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
  })

  it('prints its answer key in black ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('two-truths-and-a-fib')).toBe(true)
  })

  it('asks only for a subject and a level (plus a typed subject when chosen)', () => {
    expect(twoTruthsFibTemplate.configSchema.map((field) => field.key)).toEqual([
      'subject',
      'customSubject',
      'level',
    ])
    const custom = twoTruthsFibTemplate.configSchema.find((f) => f.key === 'customSubject')!
    expect(custom.visibleWhen?.({ subject: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ subject: 'custom' })).toBe(true)
  })

  it('refuses an empty custom subject', () => {
    expect(validateTtfConfig({ subject: 'custom', customSubject: '' })?.field).toBe('customSubject')
    expect(validateTtfConfig({ subject: 'custom', customSubject: 'Canals' })).toBeNull()
    expect(validateTtfConfig({ subject: 'mixed' })).toBeNull()
  })
})

describe('two-truths-and-a-fib content gates', () => {
  it('accepts every fixture set', () => {
    expect(fixtureSets().map((s) => s.title)).toEqual(TTF_FIXTURE_ITEMS.map((i) => i.title))
  })

  it('never prints a set the service did not fact-check', () => {
    const unchecked = TTF_FIXTURE_ITEMS.map((item) => ({ ...item, verified: false }))
    expect(selectTtfSets(unchecked, { cap: 5 })).toEqual([])
    const { verified: _dropped, ...noMark } = TTF_FIXTURE_ITEMS[0]!
    expect(normalizeTtfSet(noMark)).toBeNull()
  })

  it('drops a set of the wrong shape', () => {
    const item = TTF_FIXTURE_ITEMS[0]!
    for (const bad of [
      { ...item, truths: item.truths.slice(0, 1) },
      { ...item, truths: [...item.truths, 'Telephone wires were once made of iron and copper.'] },
      { ...item, fib: '' },
      { ...item, fact: '' },
      { ...item, fact: 'Afternoon tea became fashionable in England in the 1840s.' },
      { ...item, fib: 'Alexander Graham Bell was granted a patent for the telephone in 1896.' },
    ]) {
      expect(normalizeTtfSet(bad)).toBeNull()
    }
  })

  it('refuses statements that are unverifiable, dated, tricky or unsuitable', () => {
    for (const statement of [
      'The telephone was never used in homes before the year 1900.',
      'The first telephone call lasted about 3 minutes in total.',
      'Most homes today have a telephone in the kitchen or hall.',
      'The smartphone was introduced to shoppers in the year 2015.',
      'It was patented in 1876 by a Scottish-born inventor.',
      'You could send a telegram from almost any post office.',
      'Was the telephone patented by Bell in the year 1876?',
      'Telephones were used during the war to send urgent orders.',
      'Early Kodak cameras were loaded with rolls of paper film.',
      'Operators didn’t work at night in small country towns.',
    ]) {
      expect(normalizeStatement(statement), statement).toBeNull()
    }
    expect(normalizeStatement('B. The Rocket locomotive won the Rainhill Trials in 1829')).toBe(
      'The Rocket locomotive won the Rainhill Trials in 1829.',
    )
  })

  it('treats a paraphrase of the same fact as a repeat', () => {
    expect(
      statementsRepeat(
        'Telephones existed before television.',
        'Telephones were invented earlier than television.',
      ),
    ).toBe(true)
    expect(
      statementsRepeat(
        'The telephone was patented in 1876.',
        'The first telephone directory was printed in 1878.',
      ),
    ).toBe(false)
  })

  it('drops sets that repeat the book or each other', () => {
    const echo = {
      ...TTF_FIXTURE_ITEMS[1]!,
      title: 'Telephone Talk',
      truths: ['Bell was granted the telephone patent in 1876 as Alexander Graham Bell.', TTF_FIXTURE_ITEMS[1]!.truths[1]!],
    }
    const kept = selectTtfSets([TTF_FIXTURE_ITEMS[0], echo, TTF_FIXTURE_ITEMS[2]], {
      cap: 5,
      avoid: ['Steam Railways'],
    })
    expect(kept.map((s) => s.title)).toEqual(['Early Telephones'])
  })

  it('treats malformed replies as empty rather than throwing', () => {
    for (const junk of [undefined, null, 'x', 5, [null, 'x', { title: 3 }]]) {
      expect(selectTtfSets(junk, { cap: 5 })).toEqual([])
    }
  })
})

describe('two-truths-and-a-fib placement', () => {
  it('keeps the fib at the index the key reads, and deals letters across a page', () => {
    const sets = fixtureSets()
    for (const seed of [1, 2, 3, 42, 99]) {
      const placed = placeTtfSets(sets.slice(0, 3), seed)
      placed.forEach((set, i) => {
        expect(set.statements[set.fibIndex]).toBe(sets[i]!.fib)
        expect([...set.statements].sort()).toEqual([...sets[i]!.truths, sets[i]!.fib].sort())
      })
      // Three sets on a page never share a fib letter.
      expect(new Set(placed.map((s) => s.fibIndex)).size).toBe(3)
    }
  })

  it('spreads the fib over every letter across many pages', () => {
    const counts = [0, 0, 0]
    for (let seed = 0; seed < 300; seed++) {
      counts[placeTtfSets(fixtureSets().slice(0, 1), seed)[0]!.fibIndex]!++
    }
    for (const count of counts) expect(count).toBeGreaterThan(60)
  })
})

describe('two-truths-and-a-fib page', () => {
  it('prints what the form promises on every KDP trim, inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const showTitle of [true, false]) {
        const config = { ...base, showTitle, title: showTitle ? TTF_DEFAULT_TITLE : '' }
        const ctx = kdpCtx(w, h)
        const plan = ttfWorstCasePlan({ page: ctx, config, instruction: instructionFor(config), font: FONT })!
        expect(plan, `${w}x${h}`).not.toBeNull()
        expect(plan.count).toBeGreaterThanOrEqual(1)
        expect(plan.count).toBeLessThanOrEqual(MAX_SETS_PER_PAGE)
        expect(plan.metrics.font).toBeGreaterThanOrEqual(STATEMENT_FONT_MIN)

        const [page] = generate(config, ctx)
        const headings = texts(page!.objects).filter((t) => /^\d\.\s+\S/.test(t))
        expect(headings, `${w}x${h}`).toHaveLength(plan.count)
        const note = ttfPrintNote({ page: ctx, config, instruction: instructionFor(config), font: FONT })
        expect(note).toContain(plan.count === 1 ? '1 puzzle a page' : `${plan.count} puzzles a page`)
        expect(note).toContain(`${pxToPt(plan.metrics.font)} pt`)

        assertObjectsInSafeMargin(page!.objects, ctx)
        assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
      }
    }
  })

  it('prints three lettered statements per set, with the fib ring hidden', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const shown = texts(visible(page!.objects))
    const headings = shown.filter((t) => /^\d\.\s+\S/.test(t))
    expect(headings.length).toBe(3)
    for (const letter of TTF_LETTERS) {
      expect(shown.filter((t) => t === letter)).toHaveLength(headings.length)
    }
    const statements = shown.map(oneLine).filter((t) => allStatements.includes(t))
    expect(statements).toHaveLength(headings.length * 3)
    // Exactly one fib per set, and no correction on the puzzle page.
    expect(statements.filter((t) => fibs.has(t))).toHaveLength(headings.length)
    expect(shown.some((t) => / is the fib\. /.test(oneLine(t)))).toBe(false)

    const answers = harvestAnswers(page!.objects)
    expect(answers).toHaveLength(headings.length)
    expect(answers.every((o) => o.type === 'circle' && o.visible === false)).toBe(true)
  })

  it('stamps titles and statements so later pages can avoid them', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const labels = page!.objects
      .map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY])
      .filter((label): label is string => typeof label === 'string')
    const titles = TTF_FIXTURE_ITEMS.map((item) => item.title)
    expect(labels.filter((l) => titles.includes(l)).length).toBeGreaterThan(0)
    expect(labels.filter((l) => allStatements.includes(l)).length).toBe(
      labels.filter((l) => titles.includes(l)).length * 3,
    )
  })

  it('rings the letter of the fib on the answer page and explains it', () => {
    for (const seed of [42, 7, 1234]) {
      const [page] = generate({ ...base, seed }, kdpCtx(8.5, 11, TTF_FIXTURE, seed))
      const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
      const rings = key.filter((o) => o.type === 'circle')
      expect(rings.length).toBe(3)
      expect(rings.every((o) => o.visible === true && o.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)

      // Every ring sits on the row whose statement is the fib, and the
      // correction under the set names that same letter.
      const statementBoxes = key.filter((o) => allStatements.includes(oneLine(clean(o.text))))
      const letterBoxes = key.filter((o) => TTF_LETTERS.includes(clean(o.text) as 'A'))
      const explanations = key.filter((o) => / is the fib\. /.test(oneLine(clean(o.text))))
      expect(explanations).toHaveLength(3)
      rings.forEach((ringObj, i) => {
        const row = statementBoxes.reduce((best, o) =>
          Math.abs(o.top - ringObj.top) < Math.abs(best.top - ringObj.top) ? o : best,
        )
        expect(fibs.has(oneLine(clean(row.text)))).toBe(true)
        const letter = letterBoxes.reduce((best, o) =>
          Math.abs(o.top - row.top) < Math.abs(best.top - row.top) ? o : best,
        )
        const item = TTF_FIXTURE_ITEMS.find((it) => it.fib === oneLine(clean(row.text)))!
        expect(oneLine(clean(explanations[i]!.text))).toBe(ttfExplanation(clean(letter.text), item.fact))
      })
      // The how-to line stays on the puzzle page.
      expect(texts(key).some((t) => t.startsWith('In each set'))).toBe(false)
    }
  })

  it('numbers the answer page exactly like the puzzle page', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const puzzle = texts(page!.objects).filter((t) => /^\d\.\s+\S/.test(t))
    const key = texts(buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)).filter((t) =>
      /^\d\.\s+\S/.test(t),
    )
    expect(key).toEqual(puzzle)
    const statementsOf = (objects: StudioFabricObject[]) =>
      texts(objects).map(oneLine).filter((t) => allStatements.includes(t))
    expect(statementsOf(page!.answerSourceObjects!)).toEqual(statementsOf(page!.objects))
  })

  it('passes over a set that needs more lines than its budget and prints the next one', () => {
    const ctx = kdpCtx(6, 9)
    const plan = ttfWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
    const need = (set: TtfSet) =>
      [...set.truths, set.fib].reduce((sum, s) => sum + breakStatement(s, plan, FONT).length, 0)
    const sets = fixtureSets()
    const budget = Math.min(...sets.map(need))
    const tooLong = sets.filter((set) => need(set) > budget).map((set) => set.title)
    expect(tooLong.length).toBeGreaterThan(0)

    // Longest first, so the page has to skip before it can fill.
    const ordered = [...sets].sort((a, b) => need(b) - need(a))
    const fitted = fitTtfSets(ordered, { ...plan, setLines: budget }, FONT, 42)!
    expect(fitted.sets.length).toBeGreaterThanOrEqual(1)
    for (const set of fitted.sets) {
      expect(tooLong).not.toContain(set.title)
      expect(set.lines.reduce((sum, lines) => sum + lines.length, 0)).toBeLessThanOrEqual(budget)
    }
  })

  it('writes an error page, not a broken puzzle, when content is missing', () => {
    for (const remoteData of [undefined, null, { items: [] }, { items: 'nope' }]) {
      const [page] = generate(base, { ...STUDIO_TEST_CTX, remoteData })
      expect(page!.answerSourceObjects).toBeUndefined()
      expect(texts(page!.objects)).toContain(TTF_AI_EMPTY_MESSAGE)
      expect(harvestAnswers(page!.objects)).toHaveLength(0)
    }
  })
})

describe('two-truths-and-a-fib preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = ttfWorstCasePlan({ page: ctx, config: base, instruction: instructionFor(base), font: FONT })!
  const fitted = fitTtfSets(fixtureSets(), plan, FONT, 42)!

  it('passes a clean page', () => {
    expect(runTtfKdpPreflight({ ...fitted, font: FONT })).toMatchObject({ ok: true })
  })

  it('refuses a key that points at a true statement', () => {
    const [first, ...rest] = fitted.sets
    const moved = { ...first!, fibIndex: (first!.fibIndex + 1) % 3 }
    expect(runTtfKdpPreflight({ sets: [moved, ...rest], plan: fitted.plan, font: FONT }).ok).toBe(false)
  })

  it('refuses a correction that names a different letter', () => {
    const [first, ...rest] = fitted.sets
    const wrongLetter = TTF_LETTERS[(first!.fibIndex + 1) % 3]!
    const bad = { ...first!, explanationLines: [ttfExplanation(wrongLetter, first!.fact)] }
    expect(runTtfKdpPreflight({ sets: [bad, ...rest], plan: fitted.plan, font: FONT }).ok).toBe(false)
  })

  it('refuses the same puzzle twice and a set with a missing row', () => {
    const [first] = fitted.sets
    const twice = runTtfKdpPreflight({ sets: [first!, first!], plan: { ...plan, count: 2 }, font: FONT })
    expect(twice.ok).toBe(false)
    const short = { ...first!, statements: first!.statements.slice(0, 2), lines: first!.lines.slice(0, 2) }
    expect(runTtfKdpPreflight({ sets: [short], plan: { ...plan, count: 1 }, font: FONT }).ok).toBe(false)
  })
})
