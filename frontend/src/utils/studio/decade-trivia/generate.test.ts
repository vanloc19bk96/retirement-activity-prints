import { describe, it, expect } from 'vitest'
import { decadeTriviaTemplate, instructionFor } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { DecadeTriviaResponse, TriviaItem } from '@/types/studio-decade-trivia.types'
import { answerLabel } from './labels'
import {
  clampQuestionCount,
  resolveTopics,
  topicCoverageWarning,
  validateDecadeTriviaConfig,
} from './config'
import { toDecadeTriviaRequest, decadeTriviaPrefetch } from './prefetch'
import { cleanAnswer, isShortAnswerLength, isValidFillBlank, writeInText } from './content'
import { normalizeDecadeLabel } from './decade'
import { BODY_BOTTOM_PAD, HARD_MIN_PRINT, MIN_PRINT, MAX_PRINT, planTriviaPage, pt } from './layout'
import { contentBox, drawHeader, insetHorizontal, type Box } from '../studio-layout'
import {
  FABRIC_FONT_SIZE_MULT,
  fabricTextHeight,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
} from '../studio-text-metrics'

const FONT = { fontFamily: 'PT Serif' }

/** Absolute extent of one flattened object, using the heights the generator set. */
function extentOf(o: StudioFabricObject): {
  left: number
  top: number
  right: number
  bottom: number
} {
  if (o.type === 'line') {
    const x1 = o.x1 ?? o.left
    const y1 = o.y1 ?? o.top
    const x2 = o.x2 ?? o.left
    const y2 = o.y2 ?? o.top
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    }
  }
  const width = o.width ?? (o.radius != null ? o.radius * 2 : 0)
  const height = o.height ?? (o.radius != null ? o.radius * 2 : (o.fontSize ?? 0))
  let left = o.left
  let top = o.top
  if (o.originX === 'center') left -= width / 2
  if (o.originX === 'right') left -= width
  if (o.originY === 'center') top -= height / 2
  if (o.originY === 'bottom') top -= height
  return { left, top, right: left + width, bottom: top + height }
}

/** Flatten groups to absolute canvas coords for layout assertions. */
function flattenAbsolute(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const obj of objects) {
    if (String(obj.type ?? '').toLowerCase() === 'group' && obj.objects) {
      const cx = (obj.left ?? 0) + (obj.width ?? 0) / 2
      const cy = (obj.top ?? 0) + (obj.height ?? 0) / 2
      for (const child of obj.objects) {
        const next: StudioFabricObject = { ...child }
        if (typeof next.left === 'number') next.left += cx
        if (typeof next.top === 'number') next.top += cy
        if (child.type === 'line' && child.originX !== 'center') {
          if (typeof next.x1 === 'number') next.x1 += cx
          if (typeof next.x2 === 'number') next.x2 += cx
          if (typeof next.y1 === 'number') next.y1 += cy
          if (typeof next.y2 === 'number') next.y2 += cy
        }
        out.push(next)
      }
      continue
    }
    out.push(obj)
  }
  return out
}

const SAMPLE: TriviaItem = {
  question: 'Which dance craze swept the early 1960s?',
  options: ['The Twist', 'The Charleston', 'The Jitterbug', 'The Foxtrot'],
  answer: 'The Twist',
  topic: 'music',
  format: 'multiple-choice',
}

const LONG_QUESTION =
  'What famous Motown singing group featured Diana Ross as the lead vocalist ' +
  'during the middle of the decade before she left to begin a solo career?'

function makeItems(
  count: number,
  format: TriviaItem['format'] = 'multiple-choice',
): TriviaItem[] {
  return Array.from({ length: count }, (_, i) => ({
    question:
      format === 'fill-blank'
        ? `The household gadget everyone remembers from kitchen number ${i + 1} was the ___.`
        : `Nostalgia question number ${i + 1} about the decade everybody still talks about?`,
    options:
      format === 'multiple-choice'
        ? [`Answer ${i + 1}A`, `Answer ${i + 1}B`, `Answer ${i + 1}C`, `Answer ${i + 1}D`]
        : undefined,
    answer: format === 'multiple-choice' ? `Answer ${i + 1}A` : `Answer ${i + 1}`,
    topic: 'everyday',
    format,
  }))
}

function remote(items: TriviaItem[], decade = '1960s'): DecadeTriviaResponse {
  return { decade, items }
}

function run(
  items: TriviaItem[],
  overrides: StudioConfig = {},
  ctx: StudioGenerateContext = STUDIO_TEST_CTX,
): StudioFabricObject[] {
  resetObjectCounter()
  const config: StudioConfig = {
    ...buildDefaultConfig(decadeTriviaTemplate),
    fontFamily: 'PT Serif',
    ...overrides,
  }
  const outputs = decadeTriviaTemplate.generate(config, {
    ...ctx,
    remoteData: remote(items, String(overrides.decade ?? '1960s')),
  })
  return outputs[0]!.objects
}

/** The body box the generator lays questions into, for direct planner tests. */
function bodyArea(config: StudioConfig = {}): Box {
  const merged: StudioConfig = {
    ...buildDefaultConfig(decadeTriviaTemplate),
    fontFamily: 'PT Serif',
    ...config,
  }
  const content = insetHorizontal(contentBox(STUDIO_TEST_CTX), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    merged,
    { templateKey: 'decade-trivia', instanceId: 't', pageRole: 'single' },
    instructionFor(String(merged.decade ?? '1960s')),
  )
  return { ...header.body, height: header.body.height - BODY_BOTTOM_PAD }
}

runGeneratorContractTests(decadeTriviaTemplate, {
  expectSeedVariance: false,
  contextOverrides: { remoteData: remote(makeItems(5)) },
})

describe('studio text metrics', () => {
  it('reserves Fabric line boxes, not bare font sizes', () => {
    // Fabric renders each line at fontSize x mult x lineHeight; layout must match.
    expect(fabricTextHeight(1, 20, 1)).toBeCloseTo(20 * FABRIC_FONT_SIZE_MULT, 5)
    expect(fabricTextHeight(3, 20, 1.22)).toBeCloseTo(
      2 * 20 * FABRIC_FONT_SIZE_MULT * 1.22 + 20 * FABRIC_FONT_SIZE_MULT,
      5,
    )
    // Multi-line: full pitch for every line except the last (glyph box only).
    expect(fabricTextHeight(2, 20, 1.22)).toBeCloseTo(
      20 * FABRIC_FONT_SIZE_MULT * 1.22 + 20 * FABRIC_FONT_SIZE_MULT,
      5,
    )
  })

  it('fills the column before wrapping', () => {
    const size = 20
    const width = 320
    const lines = wrapTextToWidth(LONG_QUESTION, size, width, FONT)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(measureRunWidth(line, size, FONT)).toBeLessThanOrEqual(width)
    }
    // No line may be so short that the next line's first word would have fitted.
    for (let i = 0; i < lines.length - 1; i++) {
      const nextWord = lines[i + 1]!.split(' ')[0]!
      const candidate = `${lines[i]} ${nextWord}`
      expect(measureRunWidth(candidate, size, FONT)).toBeGreaterThan(width)
    }
  })

  it('accumulates width per word, the way Fabric wraps', () => {
    // Measuring the whole string lets cross-word kerning shave pixels off, and
    // a line Fabric thinks is too wide then looks like it fits — which showed
    // up as a prompt planned for two lines rendering as three.
    const words = 'which British band made their first appearance on'.split(' ')
    const partSum =
      words.reduce((sum, w) => sum + measureRunWidth(w, 20, FONT), 0) +
      (words.length - 1) * measureRunWidth(' ', 20, FONT)
    expect(measureRunWidth(words.join(' '), 20, FONT)).toBeCloseTo(partSum, 4)
  })

  it('measures a non-breaking space exactly like a space', () => {
    // Marker glyphs may still use NBSP; wrap decisions use plain spaces.
    // If the two measured differently, the plan and the page would disagree.
    expect(
      measureRunWidth('The\u00a0Rolling\u00a0Stones', 20, FONT),
    ).toBeCloseTo(measureRunWidth('The Rolling Stones', 20, FONT), 6)
  })

  it('wrapSafeWidth leaves enough pad that a full line stays inside the box', () => {
    const box = 400
    const safe = wrapSafeWidth(box, FONT)
    // Pad must clear Fabric's metric skew so NBSP-locked lines never expand the box.
    expect(safe).toBeLessThanOrEqual(box - 12)
    const lines = wrapTextToWidth(LONG_QUESTION, 20, safe, FONT)
    for (const line of lines) {
      // hugTextBoxWidth adds up to ~6% on estimates; keep that under the column.
      expect(measureRunWidth(line, 20, FONT) * 1.06).toBeLessThanOrEqual(box)
    }
  })

  it('breaks a run wider than the column instead of overflowing', () => {
    const lines = wrapTextToWidth('_'.repeat(400), 20, 200, FONT)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(measureRunWidth(line, 20, FONT)).toBeLessThanOrEqual(200)
    }
  })
})

describe('decade-trivia content', () => {
  it('absorbs a stranded prefix so the solution is not glued to the blank', () => {
    // "released in 19___" + "1961" used to print "in 191961".
    const { prompt, solution } = writeInText(
      'The animated classic 101 Dalmatians was released by Walt Disney Productions in 19___.',
      '1961',
    )
    expect(solution).toContain('in 1961.')
    expect(solution).not.toContain('191961')
    expect(prompt).toMatch(/in _{2,}\./)
    expect(prompt).not.toContain('19_')
  })

  it('absorbs a stranded suffix as well', () => {
    const { solution } = writeInText('The song topped the charts in ___61.', '1961')
    expect(solution).toContain('in 1961.')
    expect(solution).not.toContain('196161')
  })

  it('collapses extra blanks so only one is answered', () => {
    const { prompt, solution } = writeInText('The ___ replaced the ___ in most homes.', 'washing machine')
    expect(prompt.match(/_{2,}/g)).toHaveLength(1)
    expect(solution).toContain('washing machine')
    expect(solution).not.toMatch(/_{2,}/)
  })

  it('rejects a fill-blank with no marker instead of inventing one', () => {
    expect(isValidFillBlank('Which drink came in a glass bottle?', 'Cola')).toBe(false)
  })

  it('rejects a numeric blank glued to an answer it is not part of', () => {
    expect(isValidFillBlank('The film opened in 19___.', 'The Twist')).toBe(false)
    expect(isValidFillBlank('The film opened in 19___.', '1961')).toBe(true)
  })

  it('keeps short answers to one to four words', () => {
    expect(isShortAnswerLength('The Twist')).toBe(true)
    expect(isShortAnswerLength('The Andy Griffith Show Host')).toBe(false)
  })

  it('strips trailing punctuation and quotes from answers', () => {
    expect(cleanAnswer('  “The Supremes”.  ')).toBe('The Supremes')
  })
})

describe('decade-trivia layout', () => {
  it('is deterministic given the same remoteData', () => {
    const a = JSON.stringify(run(makeItems(5)))
    const b = JSON.stringify(run(makeItems(5)))
    expect(a).toBe(b)
  })

  it('renders one grouped question block per item', () => {
    const objects = run(makeItems(5))
    const groups = objects.filter((o) => o.type === 'group')
    expect(groups).toHaveLength(5)
  })

  it('never lets one question block overlap the next', () => {
    for (const format of ['multiple-choice', 'short-answer', 'fill-blank'] as const) {
      for (const count of [4, 6, 8]) {
        const items = makeItems(count, format).map((item, i) => ({
          ...item,
          // A long prompt is the case that used to collide with the row below.
          question:
            i % 2 === 0
              ? format === 'fill-blank'
                ? `${LONG_QUESTION} The group was called ___. (${i})`
                : `${LONG_QUESTION} (${i})`
              : item.question,
        }))
        const groups = run(items, { questionCount: count, format }).filter(
          (o) => o.type === 'group',
        )
        expect(groups).toHaveLength(count)
        for (let i = 0; i < groups.length - 1; i++) {
          const current = extentOf(groups[i]!)
          const next = extentOf(groups[i + 1]!)
          expect(next.top).toBeGreaterThanOrEqual(current.bottom - 0.5)
        }
      }
    }
  })

  it('keeps a wrapped prompt clear of the options under it', () => {
    const items = makeItems(4).map((item, i) => ({
      ...item,
      question: `${LONG_QUESTION} (${i})`,
    }))
    const objects = run(items)
    for (const group of objects.filter((o) => o.type === 'group')) {
      const children = flattenAbsolute([group])
      const prompt = children.find((c) => (c.text?.split('\n').length ?? 0) > 1)
      expect(prompt).toBeDefined()
      const promptBottom = extentOf(prompt!).bottom
      const optionTops = children
        .filter((c) => c !== prompt && c.type === 'textbox' && c.originY === 'center')
        .map((c) => extentOf(c).top)
      expect(optionTops.length).toBeGreaterThan(0)
      for (const top of optionTops) {
        expect(top).toBeGreaterThanOrEqual(promptBottom - 0.5)
      }
    }
  })

  it('keeps the revealed short-answer off the prompt above it', () => {
    const items = makeItems(4, 'short-answer').map((item, i) => ({
      ...item,
      question: `${LONG_QUESTION} (${i})`,
      answer: 'The Supremes',
    }))
    const objects = run(items, { format: 'short-answer' })
    for (const group of objects.filter((o) => o.type === 'group')) {
      const children = flattenAbsolute([group])
      const prompt = children.find((c) => c.studioRole === 'prompt' && (c.text?.length ?? 0) > 20)
      const answer = children.find((c) => c.studioRole === 'answer')
      expect(prompt).toBeDefined()
      expect(answer).toBeDefined()
      expect(extentOf(answer!).top).toBeGreaterThanOrEqual(extentOf(prompt!).bottom - 0.5)
    }
  })

  it('keeps short-answer write-in rules distinct from fill-blank on a mixed page', () => {
    // Mixed used to redraw short-answer as an inline blank, so authors only
    // saw MC + fill-blank. Short-answer must keep its handwriting rule.
    const items: TriviaItem[] = [
      {
        question: 'Which dance craze swept the early decade?',
        options: ['The Twist', 'The Charleston', 'The Jitterbug', 'The Foxtrot'],
        answer: 'The Twist',
        topic: 'music',
        format: 'multiple-choice',
      },
      {
        question: 'Who was the lead singer of The Supremes?',
        answer: 'Diana Ross',
        topic: 'music',
        format: 'short-answer',
      },
      {
        question: 'The animated classic 101 Dalmatians was released in ___.',
        answer: '1961',
        topic: 'film',
        format: 'fill-blank',
      },
      {
        question: 'Which variety show host joked with the audience every week?',
        answer: 'Ed Sullivan',
        topic: 'tv',
        format: 'short-answer',
      },
      {
        question: 'Which car was advertised as a new family favorite that year?',
        options: ['Mustang', 'Model T', 'Corvair', 'Edsel'],
        answer: 'Mustang',
        topic: 'products',
        format: 'multiple-choice',
      },
    ]
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    expect(layout.blocks[0]!.options?.length).toBeGreaterThan(0)
    expect(layout.blocks[1]!.writeRule).toBeDefined()
    expect(layout.blocks[1]!.solutionLines).toBeUndefined()
    expect(layout.blocks[2]!.solutionLines?.length).toBeGreaterThan(0)
    expect(layout.blocks[2]!.writeRule).toBeUndefined()
    expect(layout.blocks[3]!.writeRule).toBeDefined()
    expect(layout.blocks[4]!.options?.length).toBeGreaterThan(0)

    const objects = run(items, { format: 'mixed', questionCount: 5 })
    const groups = objects.filter((o) => o.type === 'group')
    expect(groups).toHaveLength(5)
    const shortAnswerGroup = flattenAbsolute([groups[1]!])
    expect(shortAnswerGroup.some((c) => c.type === 'line')).toBe(true)
    const fillBlankGroup = flattenAbsolute([groups[2]!])
    expect(fillBlankGroup.some((c) => c.type === 'line')).toBe(false)
  })

  it('hard-wraps prompts with NBSP so Fabric cannot soft-wrap into the options', () => {
    // Soft-wrapping a hard-planned line adds height the layout never reserved —
    // that is how prompt glyphs landed on the A–D rows. NBSP keeps the planned
    // line count; wrapSafeWidth keeps each locked line inside the column so
    // Fabric does not expand width past the safe-area guide.
    const items = makeItems(4).map((item, i) => ({
      ...item,
      question: `${LONG_QUESTION} (${i})`,
    }))
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    const groups = run(items).filter((o) => o.type === 'group')
    layout.blocks.forEach((block, i) => {
      const children = flattenAbsolute([groups[i]!])
      const prompt = children.find((c) => String(c.text ?? '').includes('\n'))
      expect(prompt).toBeDefined()
      expect(String(prompt!.text)).toMatch(/\u00a0/)
      expect(prompt!.width).toBeLessThanOrEqual(block.textWidth + 0.5)
      for (const line of block.promptLines) {
        expect(measureRunWidth(line, layout.fontSize, FONT)).toBeLessThanOrEqual(
          block.textWidth,
        )
      }
    })
  })

  it('draws exactly the line count the planner reserved', () => {
    const items = makeItems(4).map((item, i) => ({
      ...item,
      question: `${LONG_QUESTION} (${i})`,
    }))
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    const groups = run(items).filter((o) => o.type === 'group')
    layout.blocks.forEach((block, i) => {
      const children = flattenAbsolute([groups[i]!])
      const prompt = children.find((c) => String(c.text ?? '').includes('\n'))
      const rendered = String(prompt?.text ?? '').split('\n').length
      expect(rendered).toBe(block.promptLines.length)
    })
  })

  it('never wraps a prompt line past its text column', () => {
    const items = makeItems(5).map((item, i) => ({
      ...item,
      question: `${LONG_QUESTION} (${i})`,
    }))
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    for (const block of layout.blocks) {
      for (const line of block.promptLines) {
        expect(measureRunWidth(line, layout.fontSize, FONT)).toBeLessThanOrEqual(
          block.textWidth,
        )
      }
    }
  })

  it('aligns every question on one text column and one number gutter', () => {
    const layout = planTriviaPage({
      items: makeItems(6),
      area: bodyArea(),
      font: FONT,
    })
    const lefts = new Set(layout.blocks.map((b) => b.textLeft))
    const gutters = new Set(layout.blocks.map((b) => b.numberRight))
    expect(lefts.size).toBe(1)
    expect(gutters.size).toBe(1)
    // Numbers sit left of the text column, never inside it.
    expect([...gutters][0]!).toBeLessThan([...lefts][0]!)
  })

  it('keeps option columns and option size equal across every question', () => {
    const items = makeItems(5)
    items[2] = { ...items[2]!, options: ['A much longer option body here', 'B', 'C', 'D'], answer: 'B' }
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    const columns = new Set<number>()
    for (const block of layout.blocks) {
      for (const cell of block.options ?? []) columns.add(Math.round(cell.markerCx - block.textLeft))
    }
    expect(columns.size).toBeLessThanOrEqual(2)
    expect(layout.optionSize).toBeGreaterThan(0)
  })

  it('drops to one option column when an option cannot fit half the measure', () => {
    const long = 'An unusually long multiple choice option that will not fit a half column'
    const items = makeItems(4).map((item) => ({
      ...item,
      options: [long, `${long} two`, `${long} three`, `${long} four`],
      answer: long,
    }))
    const layout = planTriviaPage({ items, area: bodyArea(), font: FONT })
    expect(layout.optionColumns).toBe(1)
  })

  it('spreads leftover height into equal gaps rather than a top-heavy stack', () => {
    const layout = planTriviaPage({
      items: makeItems(4),
      area: bodyArea(),
      font: FONT,
    })
    expect(layout.blockGap).toBeGreaterThanOrEqual(pt(12))
    const gaps = layout.blocks
      .slice(0, -1)
      .map((b, i) => layout.blocks[i + 1]!.box.top - (b.box.top + b.box.height))
    for (const gap of gaps) expect(gap).toBeCloseTo(layout.blockGap, 5)
  })

  it('keeps default pages in the KDP large-print band', () => {
    const layout = planTriviaPage({
      items: makeItems(5),
      area: bodyArea(),
      font: FONT,
    })
    expect(layout.fontSize).toBeGreaterThanOrEqual(MIN_PRINT)
    expect(layout.fontSize).toBeLessThanOrEqual(MAX_PRINT)
  })

  it('keeps an 8-question page at or above 12pt', () => {
    const layout = planTriviaPage({
      items: makeItems(8),
      area: bodyArea({ questionCount: 8 }),
      font: FONT,
    })
    expect(layout.fontSize).toBeGreaterThanOrEqual(HARD_MIN_PRINT)
  })

  it('locks prompt and option prose with NBSP so Fabric keeps the planned line count', () => {
    // Breakable spaces let Fabric soft-wrap a hard-planned line and stack it on
    // the options below. Locked lines + wrapSafeWidth keep both axes honest.
    // Only assert inside question groups — the page header is drawn elsewhere.
    const groups = run(makeItems(5)).filter((o) => o.type === 'group')
    expect(groups.length).toBe(5)
    const prose = flattenAbsolute(groups).filter(
      (o) =>
        o.type === 'textbox' &&
        typeof o.text === 'string' &&
        (o.text.includes(' ') || o.text.includes('\u00a0')) &&
        !/^\d+\.$/.test(o.text.replace(/\u00a0/g, ' ')),
    )
    expect(prose.length).toBeGreaterThan(0)
    for (const o of prose) {
      expect(o.text).toMatch(/\u00a0/)
    }
  })

  it('keeps every object inside the safe margin', () => {
    for (const format of ['multiple-choice', 'short-answer', 'fill-blank', 'mixed'] as const) {
      const objects = run(makeItems(8, format === 'mixed' ? 'multiple-choice' : format), {
        questionCount: 8,
        format,
      })
      assertObjectsInSafeMargin(objects)
    }
  })

  it('keeps the packed stack above the bottom safe pad', () => {
    const objects = run(makeItems(8), { questionCount: 8 })
    const bottomLimit =
      STUDIO_TEST_CTX.pageHeight - STUDIO_TEST_CTX.margin.bottom - BODY_BOTTOM_PAD + 1
    for (const group of objects.filter((o) => o.type === 'group')) {
      expect(extentOf(group).bottom).toBeLessThanOrEqual(bottomLimit)
    }
  })

  it('draws only questionCount items when remoteData has extras', () => {
    const groups = run(makeItems(9), { questionCount: 5 }).filter((o) => o.type === 'group')
    expect(groups).toHaveLength(5)
  })

  it('drops an item whose answer is missing from its own options', () => {
    const items = [
      SAMPLE,
      { ...SAMPLE, question: 'Broken item?', answer: 'Not an option' },
      {
        ...SAMPLE,
        question: 'Third item?',
        options: ['Foo', 'Bar', 'Baz', 'Qux'],
        answer: 'Foo',
      },
    ]
    const groups = run(items).filter((o) => o.type === 'group')
    expect(groups).toHaveLength(2)
  })

  it('drops multiple-choice items that do not have exactly four unique options', () => {
    const items = [
      SAMPLE,
      {
        ...SAMPLE,
        question: 'Only three options?',
        options: ['The Twist', 'The Charleston', 'The Jitterbug'],
      },
    ]
    expect(run(items).filter((o) => o.type === 'group')).toHaveLength(1)
  })

  it('drops duplicate answers on the same page', () => {
    const items = [
      SAMPLE,
      { ...SAMPLE, question: 'A different prompt with the same answer?' },
    ]
    expect(run(items).filter((o) => o.type === 'group')).toHaveLength(1)
  })

  it('drops a fill-blank that never marked a blank', () => {
    const items: TriviaItem[] = [
      {
        question: 'Which drink came in a glass bottle?',
        answer: 'Cola',
        topic: 'food',
        format: 'fill-blank',
      },
    ]
    expect(run(items, { format: 'fill-blank' }).filter((o) => o.type === 'group')).toHaveLength(
      0,
    )
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    const config = { ...buildDefaultConfig(decadeTriviaTemplate), fontFamily: 'PT Serif' }
    const outputs = decadeTriviaTemplate.generate(config, STUDIO_TEST_CTX)
    expect(outputs).toHaveLength(1)
    expect(outputs[0]!.objects.length).toBeGreaterThan(0)
  })
})

describe('decade-trivia answer key', () => {
  it('keeps answer marks hidden on the puzzle page', () => {
    const objects = run(makeItems(5))
    for (const answer of harvestAnswers(objects)) {
      expect(answer.visible).toBe(false)
    }
  })

  it('prints the same questions and option order on the solution page', () => {
    const items = makeItems(5).map((item, i) => ({
      ...item,
      options: [`Right ${i}`, `W1 ${i}`, `W2 ${i}`, `W3 ${i}`],
      answer: `Right ${i}`,
    }))
    const puzzle = run(items)
    const key = buildAnswerPage(puzzle, STUDIO_ANSWER_INK_MONO)
    const puzzleCopy = flattenAbsolute(puzzle)
      .filter((o) => o.studioRole === 'prompt' && typeof o.text === 'string')
      .map((o) => String(o.text).replace(/\u00a0/g, ' '))
    const keyCopy = flattenAbsolute(key)
      .filter((o) => o.studioRole === 'prompt' && typeof o.text === 'string')
      .map((o) => String(o.text).replace(/\u00a0/g, ' '))
    expect(keyCopy).toEqual(puzzleCopy)
  })

  it('rings exactly one option per question on the solution page', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('decade-trivia')).toBe(true)
    const objects = run(makeItems(5))
    const key = buildAnswerPage(objects, STUDIO_ANSWER_INK_MONO)
    for (const group of key.filter((o) => o.type === 'group')) {
      const circles = (group.objects ?? []).filter((c) => c.type === 'circle')
      expect(circles).toHaveLength(1)
      expect(circles[0]!.visible).toBe(true)
    }
  })

  it('replaces the blanked prompt with the filled sentence on the key', () => {
    const items: TriviaItem[] = [
      {
        question: 'The animated classic 101 Dalmatians was released in 19___.',
        answer: '1961',
        topic: 'film',
        format: 'fill-blank',
      },
    ]
    const key = buildAnswerPage(run(items, { format: 'fill-blank' }), STUDIO_ANSWER_INK_MONO)
    const texts = flattenAbsolute(key)
      .map((o) => String(o.text ?? ''))
      .join(' | ')
    expect(texts).toContain('1961')
    expect(texts).not.toContain('191961')
    expect(texts).not.toMatch(/_{2,}/)
  })

  it('drops write-in rules from the solution page', () => {
    const key = buildAnswerPage(
      run(makeItems(4, 'short-answer'), { format: 'short-answer' }),
      STUDIO_ANSWER_INK_MONO,
    )
    expect(flattenAbsolute(key).some((o) => o.type === 'line')).toBe(false)
  })
})

describe('decade-trivia config', () => {
  it('answerLabel maps multiple-choice to the option letter', () => {
    expect(answerLabel(SAMPLE)).toBe('A')
    expect(answerLabel({ ...SAMPLE, answer: 'The Jitterbug' })).toBe('C')
  })

  it('clamps questions-per-page to 4-8', () => {
    expect(clampQuestionCount(2)).toBe(4)
    expect(clampQuestionCount(99)).toBe(8)
    expect(clampQuestionCount('7')).toBe(7)
    expect(clampQuestionCount(undefined)).toBe(5)
  })

  it('never widens an empty topic selection back to the defaults', () => {
    expect(resolveTopics({ topics: [] })).toEqual([])
    expect(resolveTopics({ topics: ['music', 'music', 'nonsense'] })).toEqual(['music'])
    expect(toDecadeTriviaRequest({ topics: ['tv'] }).topics).toEqual(['tv'])
  })

  it('blocks generation when no topic is ticked', () => {
    const error = validateDecadeTriviaConfig({ topics: [] })
    expect(error?.field).toBe('topics')
    expect(validateDecadeTriviaConfig({ topics: ['food'] })).toBeNull()
  })

  it('refuses to call the API with an empty topic selection', async () => {
    await expect(
      decadeTriviaPrefetch({ topics: [] }, new AbortController().signal),
    ).rejects.toThrow(/at least one topic/i)
  })

  it('validates custom decade and custom topic text', () => {
    expect(validateDecadeTriviaConfig({ customDecade: true, customDecadeText: '' })?.field).toBe(
      'customDecadeText',
    )
    expect(
      validateDecadeTriviaConfig({ customDecade: true, customDecadeText: 'the nifty fifties' })
        ?.field,
    ).toBe('customDecadeText')
    expect(
      validateDecadeTriviaConfig({ customDecade: true, customDecadeText: '2010s', topics: ['tv'] }),
    ).toBeNull()
    expect(
      validateDecadeTriviaConfig({ customTopic: true, customTopicText: '  ' })?.field,
    ).toBe('customTopicText')
  })

  it('normalizes custom decades to a YYYYYs label', () => {
    expect(normalizeDecadeLabel('2010')).toBe('2010s')
    expect(normalizeDecadeLabel('2014')).toBe('2010s')
    expect(normalizeDecadeLabel('the 2010s')).toBe('2010s')
    expect(normalizeDecadeLabel('1940s')).toBe('1940s')
  })

  it('warns when more topics are ticked than there are questions', () => {
    expect(
      topicCoverageWarning({
        topics: ['music', 'tv', 'film', 'products', 'food', 'toys'],
        questionCount: 4,
      }),
    ).toMatch(/6 topics ticked/)
    expect(topicCoverageWarning({ topics: ['music'], questionCount: 4 })).toBeNull()
  })

  it('requests the configured questionCount and decade', () => {
    const req = toDecadeTriviaRequest({
      topics: ['music'],
      questionCount: 7,
      customDecade: true,
      customDecadeText: '1974',
      format: 'mixed',
      difficulty: 'easy',
      seed: 12,
    })
    expect(req).toMatchObject({
      decade: '1970s',
      questionCount: 7,
      format: 'mixed',
      difficulty: 'easy',
      seed: 12,
    })
  })
})
