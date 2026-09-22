import { describe, it, expect } from 'vitest'
import { retirementAnagramTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_INSTRUCTION_SIZE,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { objectExtent } from '../studio-object-bounds'
import { resolveStudioMarginForPage } from '../studio-margin'
import { calculateMarginGuide, parsePageSizeLabel } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { anagramFixtureResponse } from './fixture'
import { sortedKey } from './scramble'
import {
  MAX_CLUE_CHARS,
  MIN_CLUE_CHARS,
  anagramInstruction,
  clueGivesAnswerAway,
  selectAiItems,
  worstCaseItems,
} from './content'
import {
  ANAGRAM_LEVELS,
  DEFAULT_ANAGRAM_LEVEL_ID,
  parseAnagramLevel,
  type AnagramLevelId,
} from './levels'
import {
  MAX_CLUE_LINES,
  SLOT_MIN_W,
  anagramBodyField,
  anagramPrintNote,
  anagramWorstCasePlan,
  planAnagramPage,
  pxToPt,
} from './layout'
import { wrapTextToWidth } from '../studio-text-metrics'
import { runAnagramKdpPreflight } from './kdp-preflight'
import { validateRetirementAnagramConfig } from './config'
import type { AnagramPuzzleItem } from './draw'

const remote = anagramFixtureResponse()

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
  ...over,
})

const base: StudioConfig = {
  ...buildDefaultConfig(retirementAnagramTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  title: 'Game 1',
  showTitle: true,
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flatten(obj.objects ?? [])])
}

interface ReadRow {
  index: string
  scramble: string
  clue: string
  clueText: string
  clueBox: StudioFabricObject | undefined
  answer: string
  answerLetters: StudioFabricObject[]
  rules: StudioFabricObject[]
}

/**
 * Read back the rows a page actually drew.
 *
 * Tests assert against what the group holds rather than against the plan that
 * produced it: a scramble that matches its answer in the planner and not on the
 * page is exactly the failure this template exists to make impossible.
 */
function readRows(objects: StudioFabricObject[]): ReadRow[] {
  const groups = objects.filter((obj) => obj.type === 'group' && obj.objects)
  return groups.map((group) => {
    const children = group.objects ?? []
    const texts = children.filter((child) => child.type === 'textbox')
    const answerLetters = texts.filter((child) => child.originY === 'bottom')
    const index = texts.find((child) => /^\d+\.$/.test(String(child.text ?? '')))
    const scramble = texts.find((child) => child.fontWeight === 700)
    const clue = texts.find(
      (child) =>
        child !== index && child !== scramble && !answerLetters.includes(child),
    )
    return {
      index: String(index?.text ?? ''),
      // Drawn with non-breaking spaces between the letters.
      scramble: String(scramble?.text ?? '').replace(/\s/g, ''),
      clue: String(clue?.text ?? '').replace(/\n/g, ' '),
      clueText: String(clue?.text ?? ''),
      clueBox: clue,
      answer: answerLetters.map((child) => String(child.text ?? '')).join(''),
      answerLetters,
      rules: children.filter((child) => child.type === 'rect'),
    }
  })
}

/**
 * The trims this book is actually sold in, with the margins KDP asks for.
 *
 * STUDIO_TEST_CTX is a convenient square-ish page; it is not one a seller ever
 * picks, and the safe area it describes is symmetric where a real interior
 * page's is not. Both layout faults this suite guards against — content pushed
 * to the left margin, and a writing rule landing on the bottom safe line — only
 * show up against real geometry.
 */
const REAL_PAGES = [
  { label: '5x8', size: '5 x 8 in', bleed: true },
  { label: '6x9', size: '6 x 9 in', bleed: false },
  { label: '8.5x11', size: '8.5 x 11 in', bleed: false },
] as const

function realCtx(page: (typeof REAL_PAGES)[number]): StudioGenerateContext {
  const trim = parsePageSizeLabel(page.size)
  const pageWidth = page.bleed
    ? Math.round((trim.widthInches + 0.125) * 96)
    : trim.widthPixels
  const pageHeight = page.bleed
    ? Math.round((trim.heightInches + 0.25) * 96)
    : trim.heightPixels
  return {
    ...CTX(),
    pageWidth,
    pageHeight,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth,
      pageHeight,
      marginGuide: calculateMarginGuide(120, page.bleed),
    }),
  }
}

function generatePage(config: StudioConfig = base, ctx = CTX()) {
  resetObjectCounter()
  const pages = retirementAnagramTemplate.generate(config, ctx)
  expect(pages).toHaveLength(1)
  return pages[0]!
}

runGeneratorContractTests(retirementAnagramTemplate, {
  configOverrides: { title: 'Game 1' },
  contextOverrides: { remoteData: remote },
})

assertGeneratorEntropy(retirementAnagramTemplate, {
  seeds: 40,
  configOverrides: { title: 'Game 1' },
  contextOverrides: { remoteData: remote },
})

describe('retirement-anagram page', () => {
  it('prints a numbered row per word, in order', () => {
    const rows = readRows(generatePage().objects)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    rows.forEach((row, i) => {
      expect(row.index).toBe(`${i + 1}.`)
    })
  })

  it('scrambles rearrange into exactly their own answer', () => {
    for (const level of ANAGRAM_LEVELS) {
      const rows = readRows(generatePage({ ...base, level: level.id }).objects)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(sortedKey(row.scramble)).toBe(sortedKey(row.answer))
        expect(row.scramble).not.toBe(row.answer)
        expect(row.scramble).toHaveLength(row.answer.length)
      }
    }
  })

  it('gives every row one clue that does not give its answer away', () => {
    const rows = readRows(generatePage().objects)
    for (const row of rows) {
      expect(row.clue.length).toBeGreaterThanOrEqual(MIN_CLUE_CHARS)
      expect(row.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
      expect(clueGivesAnswerAway(row.clue, row.answer)).toBe(false)
    }
  })

  it('pairs each clue with the word the content service wrote it for', () => {
    const byWord = new Map(remote.items.map((item) => [item.word, item.clue]))
    for (const row of readRows(generatePage().objects)) {
      expect(byWord.get(row.answer)).toBe(row.clue)
    }
  })

  it('does not re-wrap a planned clue line inside its textbox', () => {
    // A short answer beside a long clue used to hug the glyph run. Fabric then
    // re-broke the last word of a planned line ("the") onto a third row, and
    // "woods" sat on the writing rules even though the line above still had air.
    const letter = REAL_PAGES.find((page) => page.label === '8.5x11')!
    const ctx = {
      ...realCtx(letter),
      remoteData: {
        items: [
          { word: 'CABIN', clue: 'Small wooden house in the woods' },
          ...remote.items,
        ],
      },
    }
    const spec = { fontFamily: String(base.fontFamily) }
    const rows = readRows(generatePage({ ...base, level: 'gentle' }, ctx).objects)
    const cabin = rows.find((row) => row.answer === 'CABIN')
    expect(cabin).toBeDefined()
    expect(cabin!.clueText.split('\n')).not.toContain('the')

    for (const row of rows) {
      const box = row.clueBox
      expect(box?.width).toBeGreaterThan(0)
      const lines = row.clueText.split('\n')
      expect(lines.length).toBeLessThanOrEqual(MAX_CLUE_LINES)
      for (const line of lines) {
        expect(
          wrapTextToWidth(line, Number(box!.fontSize), Number(box!.width), spec),
        ).toEqual([line])
      }
    }
  })

  it('never repeats a word, a letter set or a scramble on one page', () => {
    const rows = readRows(generatePage().objects)
    const answers = rows.map((row) => row.answer)
    expect(new Set(answers).size).toBe(answers.length)
    const letterSets = answers.map((answer) => sortedKey(answer))
    expect(new Set(letterSets).size).toBe(letterSets.length)
    const scrambles = rows.map((row) => row.scramble)
    expect(new Set(scrambles).size).toBe(scrambles.length)
  })

  it('draws one writing rule per answer letter', () => {
    for (const row of readRows(generatePage().objects)) {
      expect(row.rules).toHaveLength(row.answer.length)
      expect(row.answerLetters).toHaveLength(row.answer.length)
    }
  })

  it('keeps answers hidden on the puzzle page', () => {
    const page = generatePage()
    const answers = harvestAnswers(page.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
  })

  it('centres the words on the page instead of hugging the left margin', () => {
    // Real KDP geometry: a recto page has a wider inside margin, so "centred"
    // means centred in the safe area, not on the sheet.
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      const rows = generatePage(base, ctx).objects.filter((o) => o.type === 'group')
      expect(rows.length).toBeGreaterThan(0)
      const left = Math.min(...rows.map((o) => objectExtent(o).left))
      const right = Math.max(...rows.map((o) => objectExtent(o).right))
      const slackLeft = left - ctx.margin.left
      const slackRight = ctx.pageWidth - ctx.margin.right - right
      expect(slackLeft).toBeGreaterThan(0)
      // Symmetric to within a pixel of rounding.
      expect(Math.abs(slackLeft - slackRight)).toBeLessThanOrEqual(2)
    }
  })

  it('leaves air under the last writing rule on every real trim', () => {
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      const built = generatePage(base, ctx)
      const safeBottom = ctx.pageHeight - ctx.margin.bottom
      for (const objects of [
        built.objects,
        buildAnswerPage(built.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
          contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
        }),
      ]) {
        const bottom = Math.max(...objects.map((o) => objectExtent(o).bottom))
        // Not merely inside the line — clear of it, so the difference between
        // estimated and real glyph metrics cannot push a rule over.
        expect(safeBottom - bottom).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('numbers a two-column page down each column, not across the rows', () => {
    const ctx = realCtx(REAL_PAGES.find((p) => p.label === '8.5x11')!)
    const built = generatePage(base, ctx)
    const rows = readRows(built.objects)
    const groups = built.objects.filter((o) => o.type === 'group')
    expect(rows.length).toBeGreaterThan(8)

    const lefts = [...new Set(groups.map((o) => Math.round(objectExtent(o).left)))]
    expect(lefts.length).toBe(2)

    // 1..n runs down the first column before the second one starts.
    const firstColumn = groups
      .map((o, i) => ({ i, left: Math.round(objectExtent(o).left), top: objectExtent(o).top }))
      .filter((o) => o.left === Math.min(...lefts))
    expect(firstColumn.map((o) => o.i)).toEqual(
      firstColumn.map((_, i) => i),
    )
    const tops = firstColumn.map((o) => o.top)
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
  })

  it('sets every page of one run at the same size and column count', () => {
    // The worst case is measured once; a page of short clues must not come back
    // bigger than a page of long ones, or a book stops looking like a book.
    const ctx = realCtx(REAL_PAGES.find((p) => p.label === '6x9')!)
    // Both inside the printed clue budget, so the only difference is how many
    // lines they break to.
    const withClue = (clue: string) => ({
      items: remote.items.map((item) => ({ ...item, clue })),
    })
    const sizeOf = (remoteData: unknown) => {
      const rows = readRows(generatePage(base, { ...ctx, remoteData }).objects)
      expect(rows.length).toBeGreaterThan(0)
      return rows[0]!.answerLetters[0]!.fontSize
    }
    expect(sizeOf(withClue('A pleasant thing'))).toBe(
      sizeOf(withClue('Part of a pleasant and unhurried day')),
    )
  })

  it('keeps every object inside the safe margin on the puzzle and the key', () => {
    const ctx = CTX()
    const page = generatePage(base, ctx)
    assertObjectsInSafeMargin(page.objects, ctx)
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
      contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
    })
    assertObjectsInSafeMargin(key, ctx)
  })
})

describe('retirement-anagram solution page', () => {
  it('is the puzzle page with the words written onto the lines', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const puzzleRows = readRows(page.objects)
    const keyRows = readRows(key)

    expect(keyRows).toHaveLength(puzzleRows.length)
    keyRows.forEach((row, i) => {
      const puzzle = puzzleRows[i]!
      // Same prompt, same clue, same slots — a reader checking an answer is
      // looking at the row they solved, not at a bare list.
      expect(row.scramble).toBe(puzzle.scramble)
      expect(row.clue).toBe(puzzle.clue)
      expect(row.rules).toHaveLength(puzzle.rules.length)
      expect(row.answer).toBe(puzzle.answer)
    })
  })

  it('reveals every answer letter in print-safe black', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const revealed = flatten(key).filter((obj) => obj.studioRole === 'answer')
    expect(revealed.length).toBeGreaterThan(0)
    for (const obj of revealed) {
      expect(obj.visible).toBe(true)
      expect(obj.fill).toBe(STUDIO_ANSWER_INK_MONO)
    }
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('retirement-anagram')).toBe(true)
  })

  it('drops the instruction strip but keeps the clues', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const instruction = anagramInstruction(parseAnagramLevel(base))
    const texts = flatten(key).map((obj) => String(obj.text ?? ''))
    expect(texts).not.toContain(instruction)
    // A clue set at exactly the instruction size must not be mistaken for one.
    expect(readRows(key).every((row) => row.clue.length > 0)).toBe(true)
  })

  it('never tags a clue as instruction decoration', () => {
    // `shouldOmitFromAnswerPage` drops decoration text at the instruction size;
    // a clue that happened to land on that size would vanish from the key.
    const page = generatePage()
    for (const obj of flatten(page.answerSourceObjects!)) {
      if (obj.studioRole !== 'decoration') continue
      expect(obj.fontSize === STUDIO_INSTRUCTION_SIZE && obj.originY === 'bottom').toBe(
        false,
      )
    }
  })
})

describe('retirement-anagram levels', () => {
  it('defaults to classic and reads the saved level back', () => {
    expect(parseAnagramLevel({}).id).toBe(DEFAULT_ANAGRAM_LEVEL_ID)
    for (const level of ANAGRAM_LEVELS) {
      expect(parseAnagramLevel({ level: level.id }).id).toBe(level.id)
    }
  })

  it('maps sheets saved against the old difficulty field', () => {
    const legacy: [unknown, AnagramLevelId][] = [
      ['easy', 'gentle'],
      ['medium', 'classic'],
      ['hard', 'challenging'],
    ]
    for (const [difficulty, expected] of legacy) {
      expect(parseAnagramLevel({ difficulty }).id).toBe(expected)
    }
  })

  it('keeps every answer inside its level letter band', () => {
    for (const level of ANAGRAM_LEVELS) {
      for (const row of readRows(generatePage({ ...base, level: level.id }).objects)) {
        expect(row.answer.length).toBeGreaterThanOrEqual(level.minLetters)
        expect(row.answer.length).toBeLessThanOrEqual(level.maxLetters)
      }
    }
  })

  it('prints the first letter on the gentle level, and only there', () => {
    const gentle = generatePage({ ...base, level: 'gentle' })
    for (const row of readRows(gentle.objects)) {
      expect(row.answerLetters[0]?.studioRole).toBe('prompt')
      expect(row.answerLetters[0]?.visible).not.toBe(false)
      for (const letter of row.answerLetters.slice(1)) {
        expect(letter.studioRole).toBe('answer')
      }
    }

    const classic = generatePage({ ...base, level: 'classic' })
    for (const row of readRows(classic.objects)) {
      expect(row.answerLetters.every((l) => l.studioRole === 'answer')).toBe(true)
    }
  })

  it('shuffles every letter out of its seat on the challenging level', () => {
    for (const row of readRows(generatePage({ ...base, level: 'challenging' }).objects)) {
      const held = [...row.answer].filter((ch, i) => ch === row.scramble[i]).length
      // A derangement is preferred, not guaranteed: a word of repeated letters
      // cannot always give one. Most of the word must still move.
      expect(held).toBeLessThan(row.answer.length / 2)
    }
  })
})

describe('retirement-anagram page plan', () => {
  const font = 'PT Serif'

  it('never sets answer slots below the writing floor', () => {
    for (const level of ANAGRAM_LEVELS) {
      const config = { ...base, level: level.id }
      const plan = anagramWorstCasePlan({
        level,
        page: STUDIO_TEST_CTX,
        config,
        instruction: anagramInstruction(level),
        font,
      })
      expect(plan).not.toBeNull()
      expect(plan!.metrics.slotW).toBeGreaterThanOrEqual(SLOT_MIN_W)
      // Large print: KDP's own floor for a body face is 14 pt.
      expect(pxToPt(plan!.metrics.scrambleFont)).toBeGreaterThanOrEqual(14)
      expect(pxToPt(plan!.metrics.clueFont)).toBeGreaterThanOrEqual(12)
    }
  })

  it('prints no more words than the form promised', () => {
    for (const level of ANAGRAM_LEVELS) {
      const config = { ...base, level: level.id }
      const promised = anagramWorstCasePlan({
        level,
        page: STUDIO_TEST_CTX,
        config,
        instruction: anagramInstruction(level),
        font,
      })!
      const rows = readRows(generatePage(config).objects)
      expect(rows.length).toBe(promised.itemCount)
      expect(promised.itemCount).toBeLessThanOrEqual(level.targetItems)
    }
  })

  it('keeps the stack inside the body column, with air under the last rule', () => {
    for (const level of ANAGRAM_LEVELS) {
      const config = { ...base, level: level.id }
      const instruction = anagramInstruction(level)
      const field = anagramBodyField(STUDIO_TEST_CTX, config, instruction)
      const plan = anagramWorstCasePlan({
        level,
        page: STUDIO_TEST_CTX,
        config,
        instruction,
        font,
      })!
      const stack =
        plan.rowHeight * plan.rowsPerColumn +
        plan.metrics.gutter * Math.max(0, plan.rowsPerColumn - 1)
      expect(plan.bottomGuard).toBeGreaterThan(0)
      // A rule that lands on the safe line reads as a printing fault, and
      // leaves nothing in hand for the gap between estimated and real metrics.
      expect(stack).toBeLessThanOrEqual(field.height - plan.bottomGuard)
      expect(plan.rowsPerColumn * plan.columns).toBeGreaterThanOrEqual(plan.itemCount)
    }
  })

  it('reserves the full clue budget when promising a count', () => {
    const level = parseAnagramLevel(base)
    const plan = anagramWorstCasePlan({
      level,
      page: STUDIO_TEST_CTX,
      config: base,
      instruction: anagramInstruction(level),
      font,
    })!
    // The promise is measured against the worst clue the gate allows, so a real
    // clue can only ever need less room than the row already holds.
    expect(plan.clueLineCount).toBe(MAX_CLUE_LINES)
  })

  it('refuses a page too small to print at the floor', () => {
    const level = parseAnagramLevel(base)
    const tiny = {
      pageWidth: 160,
      pageHeight: 200,
      margin: { top: 36, right: 36, bottom: 36, left: 36 },
    }
    expect(
      anagramWorstCasePlan({
        level,
        page: tiny,
        config: base,
        instruction: anagramInstruction(level),
        font,
      }),
    ).toBeNull()
    expect(
      anagramPrintNote({
        level,
        page: tiny,
        config: base,
        instruction: anagramInstruction(level),
        font,
      }),
    ).toMatch(/too small/i)
  })

  it('reports what the trim in Settings produces', () => {
    const level = parseAnagramLevel(base)
    const note = anagramPrintNote({
      level,
      page: STUDIO_TEST_CTX,
      config: base,
      instruction: anagramInstruction(level),
      font,
    })
    const plan = anagramWorstCasePlan({
      level,
      page: STUDIO_TEST_CTX,
      config: base,
      instruction: anagramInstruction(level),
      font,
    })!
    expect(note).toContain(`${plan.itemCount} words a page`)
    expect(note).toContain(`${pxToPt(plan.metrics.scrambleFont)} pt`)
    expect(note).toContain('answer page')
  })

  it('fits more words on a larger trim than on a smaller one', () => {
    const level = parseAnagramLevel(base)
    const instruction = anagramInstruction(level)
    const small = anagramWorstCasePlan({
      level,
      page: {
        pageWidth: 480,
        pageHeight: 768,
        margin: { top: 36, right: 36, bottom: 36, left: 48 },
      },
      config: base,
      instruction,
      font,
    })!
    const large = anagramWorstCasePlan({
      level,
      page: {
        pageWidth: 816,
        pageHeight: 1056,
        margin: { top: 36, right: 36, bottom: 36, left: 48 },
      },
      config: base,
      instruction,
      font,
    })!
    expect(large.itemCount).toBeGreaterThan(small.itemCount)
  })

  it('reports a reduced page as the trim doing its job', () => {
    const level = parseAnagramLevel(base)
    const instruction = anagramInstruction(level)
    const page = {
      pageWidth: 480,
      pageHeight: 768,
      margin: { top: 36, right: 36, bottom: 36, left: 48 },
    }
    const plan = anagramWorstCasePlan({ level, page, config: base, instruction, font })!
    if (!plan.reducedByPage) return
    expect(
      anagramPrintNote({ level, page, config: base, instruction, font }),
    ).toContain('larger page size')
  })

  it('accepts the worst case every gate allows', () => {
    const level = parseAnagramLevel(base)
    const items = worstCaseItems(level, level.targetItems)
    for (const item of items) {
      expect(item.answer.length).toBe(level.maxLetters)
      expect(item.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
    }
    const plan = planAnagramPage({
      field: anagramBodyField(STUDIO_TEST_CTX, base, anagramInstruction(level)),
      items,
      target: level.targetItems,
      spec: { fontFamily: font },
    })
    expect(plan).not.toBeNull()
  })
})

describe('retirement-anagram content gate', () => {
  const level = parseAnagramLevel({ level: 'classic' })

  it('drops words whose letters spell another common word', () => {
    const picked = selectAiItems([{ word: 'GARDEN', clue: 'Where the roses grow' }], {
      count: 5,
      level,
    })
    expect(picked).toHaveLength(0)
  })

  it('drops a clue that contains its own answer or a stem of it', () => {
    const picked = selectAiItems(
      [
        { word: 'TRAVEL', clue: 'What a traveller does abroad' },
        { word: 'COOKING', clue: 'What a cook does at supper' },
      ],
      { count: 5, level },
    )
    expect(picked).toHaveLength(0)
  })

  it('drops a clue longer than the printed column', () => {
    const picked = selectAiItems(
      [{ word: 'TRAVEL', clue: 'x'.repeat(MAX_CLUE_CHARS + 1) }],
      { count: 5, level },
    )
    expect(picked).toHaveLength(0)
  })

  it('drops a word outside the level letter band', () => {
    const picked = selectAiItems([{ word: 'WALK', clue: 'A turn around the block' }], {
      count: 5,
      level,
    })
    expect(picked).toHaveLength(0)
  })

  it('keeps one word per letter set', () => {
    const picked = selectAiItems(
      [
        { word: 'TRAVEL', clue: 'Seeing places far from home' },
        { word: 'VARLET', clue: 'An old word for a servant' },
      ],
      { count: 5, level },
    )
    expect(picked.length).toBeLessThanOrEqual(1)
  })
})

describe('retirement-anagram preflight', () => {
  const level = parseAnagramLevel({ level: 'classic' })
  const plan = anagramWorstCasePlan({
    level,
    page: STUDIO_TEST_CTX,
    config: base,
    instruction: anagramInstruction(level),
    font: 'PT Serif',
  })!

  const ok: AnagramPuzzleItem[] = [
    { answer: 'TRAVEL', clue: 'Seeing places far from home', scrambled: 'LEVART' },
    { answer: 'CRUISE', clue: 'A holiday spent at sea', scrambled: 'ESIURC' },
  ]
  const run = (items: AnagramPuzzleItem[]) =>
    runAnagramKdpPreflight({ items, level, plan: { ...plan, itemCount: items.length } })

  it('passes a page whose every row is answerable', () => {
    expect(run(ok).ok).toBe(true)
  })

  it('refuses a scramble that cannot be rearranged into its answer', () => {
    const result = run([{ ...ok[0]!, scrambled: 'LEVARX' }])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/rearrange/i)
  })

  it('refuses a word printed unscrambled', () => {
    const result = run([{ ...ok[0]!, scrambled: 'TRAVEL' }])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/unscrambled/i)
  })

  it('refuses a row with no clue', () => {
    const result = run([{ ...ok[0]!, clue: '' }])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/without a clue/i)
  })

  it('refuses a clue that gives its answer away', () => {
    const result = run([{ ...ok[0]!, clue: 'What a traveller does abroad' }])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/gives its own answer away/i)
  })

  it('refuses two rows built from one letter set', () => {
    const result = run([
      ok[0]!,
      { answer: 'VARLET', clue: 'An old word for a servant', scrambled: 'TELVAR' },
    ])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/same letters/i)
  })

  it('refuses the same word twice', () => {
    const result = run([ok[0]!, { ...ok[0]!, scrambled: 'VELTRA' }])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/twice/i)
  })
})

describe('retirement-anagram form', () => {
  it('asks two questions, plus the custom theme box when it is needed', () => {
    // The template owns two questions; the registry prepends the shared page
    // header fields to every game's form.
    expect(retirementAnagramTemplate.configSchema.map((field) => field.key)).toEqual([
      'theme',
      'customTheme',
      'level',
    ])
    expect(getStudioTemplate('retirement-anagram')!.configSchema.map((f) => f.key)).toEqual(
      ['showTitle', 'title', 'showInstructions', 'theme', 'customTheme', 'level'],
    )
    const custom = retirementAnagramTemplate.configSchema.find(
      (field) => field.key === 'customTheme',
    )!
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
  })

  it('exposes no word count and no print-style control', () => {
    const keys = retirementAnagramTemplate.configSchema.map((field) => field.key)
    expect(keys).not.toContain('itemCount')
    expect(keys).not.toContain('difficulty')
    expect(keys).not.toContain('printStyle')
    expect(keys).not.toContain('topic')
  })

  it('asks for a theme only when the seller chose to write one', () => {
    expect(validateRetirementAnagramConfig({ theme: 'mixed' })).toBeNull()
    expect(validateRetirementAnagramConfig({ theme: 'gardening' })).toBeNull()
    const error = validateRetirementAnagramConfig({ theme: 'custom', customTheme: '  ' })
    expect(error?.field).toBe('customTheme')
    expect(error?.message).toMatch(/words/)
  })

  it('warns about a theme that carries someone else rights', () => {
    const custom = retirementAnagramTemplate.configSchema.find(
      (field) => field.key === 'customTheme',
    )!
    expect(custom.warningWhen?.({ customTheme: 'Disney holidays' })).toMatch(
      /intellectual property/i,
    )
    expect(custom.warningWhen?.({ customTheme: 'Weekends in the garden' })).toBeNull()
  })
})

describe('retirement-anagram failure pages', () => {
  it('says so plainly when the content service returns nothing usable', () => {
    const page = generatePage(base, CTX({ remoteData: { items: [] } }))
    const text = flatten(page.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).toMatch(/Could not write enough retirement words/i)
    assertObjectsInSafeMargin(page.objects, CTX())
  })

  it('points at the page size when the trim cannot hold a puzzle', () => {
    const tiny = CTX({
      pageWidth: 160,
      pageHeight: 200,
      margin: { top: 36, right: 36, bottom: 36, left: 36 },
    })
    resetObjectCounter()
    const pages = retirementAnagramTemplate.generate(base, tiny)
    const text = flatten(pages[0]!.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).toMatch(/too small/i)
  })
})
