import { describe, it, expect } from 'vitest'
import { titleCompleteTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { TitleCompleteResponse, TitleItem } from '@/types/studio-title-complete.types'
import { loadCuratedBank } from './fallback'
import {
  BLANK_TOKEN,
  blankOut,
  restore,
  exceedsWordCap,
  isLyricShaped,
  hasStopwordAnswer,
  hasVisibleCue,
} from './validate'
import {
  MIN_BLANK_W,
  MIN_WRITING_BLANK,
  blankWidthFor,
  LARGE_PRINT,
  COLUMN_COUNT,
  fitTitleTable,
  resolveBlankPlacement,
} from './draw'
import { MIN_LARGE_PRINT, packTitleGrid } from './layout'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const obj of objects) {
    out.push(obj)
    if (String(obj.type ?? '').toLowerCase() === 'group' && obj.objects) {
      out.push(...flattenObjects(obj.objects))
    }
  }
  return out
}

const SAMPLE_ITEMS: TitleItem[] = [
  {
    displayTitle: `Singin' in the ${BLANK_TOKEN}`,
    answer: 'Rain',
    fullTitle: "Singin' in the Rain",
    category: 'film',
    year: 1952,
  },
  {
    displayTitle: `The Sound of ${BLANK_TOKEN}`,
    answer: 'Music',
    fullTitle: 'The Sound of Music',
    category: 'film',
    year: 1965,
  },
  {
    displayTitle: `${BLANK_TOKEN} California`,
    answer: 'Hotel',
    fullTitle: 'Hotel California',
    category: 'song',
    year: 1977,
  },
]

function makeItems(count: number): TitleItem[] {
  return Array.from({ length: count }, (_, i) => {
    const base = SAMPLE_ITEMS[i % SAMPLE_ITEMS.length]!
    // Unique titles for distinctness checks while keeping blank pattern.
    return {
      ...base,
      fullTitle: `Title Number ${i + 1}`,
      displayTitle: `Title ${BLANK_TOKEN} ${i + 1}`,
      answer: 'Number',
    }
  })
}

const REMOTE: TitleCompleteResponse = {
  items: [
    ...SAMPLE_ITEMS,
    ...makeItems(9).map((it, i) => ({
      ...it,
      fullTitle: `Famous Work ${i + 4}`,
      displayTitle: `Famous ${BLANK_TOKEN} ${i + 4}`,
      answer: 'Work',
    })),
  ],
}

const CTX = (
  remote: TitleCompleteResponse | undefined = REMOTE,
): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const base = {
  ...buildDefaultConfig(titleCompleteTemplate),
  seed: 42,
  fontFamily: 'Inter',
  itemCount: 12,
}

describe('title-complete — LEGAL gate', () => {
  it('the printed title is exactly the stored title with one span blanked', () => {
    for (const item of SAMPLE_ITEMS) {
      expect(restore(item.displayTitle, item.answer)).toBe(item.fullTitle)
    }
  })

  it('rejects items longer than the word cap', () => {
    expect(exceedsWordCap('One Two Three Four Five Six Seven Eight Nine')).toBe(true)
    expect(exceedsWordCap('Hotel California')).toBe(false)
  })

  it('rejects lyric-shaped content', () => {
    expect(isLyricShaped('Somewhere over the rainbow...')).toBe(true)
    expect(isLyricShaped('What is the next line')).toBe(true)
    expect(isLyricShaped('Hotel California')).toBe(false)
  })

  it('rejects stopword answers', () => {
    expect(hasStopwordAnswer('The')).toBe(true)
    expect(hasStopwordAnswer('Rain')).toBe(false)
  })

  it('blankOut + restore round-trips curated titles', () => {
    const display = blankOut("Singin' in the Rain", 'Rain')
    expect(display).toBe(`Singin' in the ${BLANK_TOKEN}`)
    expect(restore(display!, 'Rain')).toBe("Singin' in the Rain")
  })

  it('rejects blank-only prompts (whole title blanked)', () => {
    expect(blankOut('Gunsmoke', 'Gunsmoke')).toBeNull()
    expect(hasVisibleCue(BLANK_TOKEN)).toBe(false)
    expect(hasVisibleCue(`Leave It to ${BLANK_TOKEN}`)).toBe(true)
  })
})

describe('title-complete — LAYOUT gate', () => {
  it('item baselines are identical across pages with the same itemCount', () => {
    const remoteA: TitleCompleteResponse = { items: makeItems(12) }
    const remoteB: TitleCompleteResponse = {
      items: makeItems(12).map((it) => ({
        ...it,
        answer: 'Word',
        displayTitle: `Other ${BLANK_TOKEN} Title`,
        fullTitle: 'Other Word Title',
      })),
    }
    resetObjectCounter()
    const [pageA] = titleCompleteTemplate.generate(base, CTX(remoteA))
    resetObjectCounter()
    const [pageB] = titleCompleteTemplate.generate(base, CTX(remoteB))

    const linesA = flattenObjects(pageA.objects).filter(
      (o) => o.type === 'line' && o.studioRole === 'structure',
    )
    const linesB = flattenObjects(pageB.objects).filter(
      (o) => o.type === 'line' && o.studioRole === 'structure',
    )
    expect(linesA.length).toBe(linesB.length)
    for (let i = 0; i < linesA.length; i++) {
      expect(linesA[i]!.y1).toBeCloseTo(linesB[i]!.y1!, 0.5)
    }
  })

  it('no blank is narrower than a usable writing width', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(base, CTX())
    const blanks = flattenObjects(page.objects).filter(
      (o) => o.type === 'line' && o.studioRole === 'structure',
    )
    expect(blanks.length).toBeGreaterThan(0)
    const minUsable = Math.min(MIN_WRITING_BLANK, LARGE_PRINT * 3)
    for (const line of blanks) {
      const width = Math.abs((line.x2 ?? 0) - (line.x1 ?? 0))
      expect(width).toBeGreaterThanOrEqual(minUsable - 0.5)
    }
  })

  it('equal-cell grid keeps row rhythm even with a long title', () => {
    const items = makeItems(8)
    items[0] = {
      displayTitle: `A Very Long Leading Phrase Before The ${BLANK_TOKEN}`,
      answer: 'Blank',
      fullTitle: 'A Very Long Leading Phrase Before The Blank',
      category: 'song',
    }
    const remote: TitleCompleteResponse = { items }
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(
      { ...base, itemCount: 8 },
      CTX(remote),
    )
    const numbers = flattenObjects(page.objects).filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(numbers.length).toBe(8)
    // Shared gutter band: assert equal row pitch (2 items share each row top).
    const tops = [...new Set(numbers.map((n) => Math.round(n.top ?? 0)))].sort((a, b) => a - b)
    expect(tops.length).toBe(4)
    const gaps = tops.slice(1).map((t, i) => t - tops[i]!)
    const first = gaps[0]!
    for (const gap of gaps) {
      expect(Math.abs(gap - first)).toBeLessThan(1)
    }
  })

  it('uses a two-column equal-cell grid with aligned rows', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(base, CTX())
    const flat = flattenObjects(page.objects)
    expect(flat.some((o) => String(o.type ?? '').toLowerCase() === 'group')).toBe(true)
    const numbers = flat.filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(numbers.length).toBe(12)
    const tops = [...new Set(numbers.map((n) => Math.round(n.top ?? 0)))].sort((a, b) => a - b)
    expect(tops.length).toBe(6)
    for (const top of tops) {
      expect(numbers.filter((n) => Math.round(n.top ?? 0) === top).length).toBe(COLUMN_COUNT)
    }
  })

  it('keeps item numbers near the title baseline', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(base, CTX())
    const flat = flattenObjects(page.objects)
    const number = flat.find((o) => o.studioRole === 'decoration' && o.text === '1.')
    const prompt = flat.find(
      (o) => o.studioRole === 'prompt' && String(o.text ?? '').length > 0,
    )
    expect(number).toBeTruthy()
    expect(prompt).toBeTruthy()
    expect(Math.abs((number!.top ?? 0) - (prompt!.top ?? 0))).toBeLessThan(8)
  })

  it('aligns index numbers on a shared right-aligned gutter', () => {
    const items = makeItems(10)
    items[0] = {
      ...items[0]!,
      displayTitle: `${BLANK_TOKEN}`,
      answer: 'Hi',
      fullTitle: 'Hi',
    }
    items[1] = {
      ...items[1]!,
      displayTitle: `A Much Longer Cue Before The ${BLANK_TOKEN}`,
      answer: 'Word',
      fullTitle: 'A Much Longer Cue Before The Word',
    }
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(
      { ...base, itemCount: 10 },
      CTX({ items }),
    )
    const indexes = flattenObjects(page.objects).filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(indexes).toHaveLength(10)
    expect(indexes.every((o) => o.textAlign === 'right')).toBe(true)
    expect(new Set(indexes.map((o) => Number(o.width ?? 0))).size).toBe(1)
    const lefts = indexes.map((o) => Number(o.left ?? 0))
    const mid = (Math.min(...lefts) + Math.max(...lefts)) / 2
    const leftCol = indexes.filter((o) => Number(o.left ?? 0) < mid)
    const rightCol = indexes.filter((o) => Number(o.left ?? 0) >= mid)
    expect(new Set(leftCol.map((o) => Number(o.left ?? 0))).size).toBe(1)
    expect(new Set(rightCol.map((o) => Number(o.left ?? 0))).size).toBe(1)
  })

  it('blankWidthFor never drops below the minimum without a clamp', () => {
    expect(blankWidthFor('A', LARGE_PRINT)).toBeGreaterThanOrEqual(MIN_BLANK_W)
    expect(blankWidthFor('California', LARGE_PRINT)).toBeGreaterThanOrEqual(MIN_BLANK_W)
  })

  it('keeps the blank on the same line by shrinking before wrapping', () => {
    const preferred = 120
    const placed = resolveBlankPlacement({
      beforeW: 200,
      afterW: 0,
      hintW: 0,
      preferredBlankW: preferred,
      maxW: 280,
      allowWrap: true,
    })
    expect(placed.wrapBlank).toBe(false)
    expect(placed.afterOnLine2).toBe(false)
    expect(placed.blankW).toBe(80)
  })

  it('wraps the blank only when remaining space is below the writing floor', () => {
    const placed = resolveBlankPlacement({
      beforeW: 260,
      afterW: 0,
      hintW: 0,
      preferredBlankW: 100,
      maxW: 280,
      allowWrap: true,
    })
    expect(placed.wrapBlank).toBe(true)
    expect(placed.afterOnLine2).toBe(false)
  })

  it('moves the whole after phrase to line 2 instead of soft-wrapping mid-words', () => {
    const placed = resolveBlankPlacement({
      beforeW: 0,
      afterW: 220,
      hintW: 0,
      preferredBlankW: 100,
      maxW: 280,
      allowWrap: true,
    })
    expect(placed.wrapBlank).toBe(false)
    expect(placed.afterOnLine2).toBe(true)
  })

  it('fitTitleTable centers equal cells in the field', () => {
    const area = { left: 40, top: 100, width: 800, height: 600 }
    const table = fitTitleTable(area, 12, COLUMN_COUNT)
    expect(table.cols).toBe(COLUMN_COUNT)
    expect(table.rows).toBe(6)
    expect(table.cellW * table.cols).toBe(table.bounds.width)
    expect(table.cellH * table.rows).toBe(table.bounds.height)
    expect(table.bounds.left).toBeGreaterThanOrEqual(area.left)
    expect(table.bounds.top).toBeGreaterThanOrEqual(area.top)
    const cell0 = table.cellBox(0, 0)
    const cell1 = table.cellBox(0, 1)
    expect(cell0.width).toBe(cell1.width)
    expect(cell0.height).toBe(cell1.height)
  })

  it('keeps shared title size in the KDP large-print band on a normal page', () => {
    const area = { left: 40, top: 100, width: 2000, height: 2400 }
    const { fontSize } = packTitleGrid(area, makeItems(12), false)
    expect(fontSize).toBeLessThanOrEqual(LARGE_PRINT + 0.01)
    expect(fontSize).toBeGreaterThanOrEqual(MIN_LARGE_PRINT - 0.01)
  })
})

describe('title-complete — content', () => {
  it('is deterministic given the same remoteData', () => {
    resetObjectCounter()
    const a = titleCompleteTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = titleCompleteTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('no two items on a page share a title', () => {
    const data = loadCuratedBank({ category: 'mixed', itemCount: 12, seed: 5 })
    const titles = data.items.map((it) => it.fullTitle.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('one hidden answer per item', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(base, CTX())
    const answers = harvestAnswers(page.objects)
    expect(answers.length).toBe(Math.min(12, REMOTE.items.length))
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      titleCompleteTemplate.generate(base, { ...CTX(), remoteData: undefined }),
    ).not.toThrow()
  })

  it('emits a centered answer-key grid without prompts/blanks/letter hints', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('title-complete')).toBe(true)
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(
      { ...base, showLengthHint: true },
      CTX(),
    )
    expect(page.answerSourceObjects?.length).toBeGreaterThan(0)
    const flatPuzzle = flattenObjects(page.objects)
    expect(
      flatPuzzle.some(
        (o) => o.studioRole === 'decoration' && /^\(\d+\)$/.test(String(o.text ?? '')),
      ),
    ).toBe(true)
    const keyObjects = buildAnswerPage(
      page.answerSourceObjects ?? page.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const flatKey = flattenObjects(keyObjects)
    const revealed = flatKey.filter((o) => o.studioRole === 'answer')
    const numbers = flatKey.filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(revealed.length).toBeGreaterThan(0)
    expect(numbers.length).toBe(revealed.length)
    expect(revealed.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(flatKey.every((o) => o.studioRole !== 'prompt')).toBe(true)
    expect(
      flatKey.every((o) => !(o.type === 'line' && o.studioRole === 'structure')),
    ).toBe(true)
    expect(
      flatKey.every(
        (o) => !(o.studioRole === 'decoration' && /^\(\d+\)$/.test(String(o.text ?? ''))),
      ),
    ).toBe(true)
    // Index + answer share a vertical center in each cell.
    expect(revealed.every((o) => o.originY === 'center')).toBe(true)
    expect(numbers.every((o) => o.originY === 'center')).toBe(true)
  })

  it('keeps max itemCount inside the safe margin', () => {
    resetObjectCounter()
    const remote: TitleCompleteResponse = { items: makeItems(20) }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const pages = titleCompleteTemplate.generate(
      { ...base, itemCount: 20 },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('does not print answers on the puzzle page', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(base, CTX())
    expect(
      page.objects.some(
        (o) =>
          o.visible !== false &&
          /^Answers\s*:/i.test(String(o.text ?? '')),
      ),
    ).toBe(false)
    expect(harvestAnswers(page.objects).length).toBeGreaterThan(0)
  })

  it('curated bank returns items', () => {
    const data = loadCuratedBank({
      category: 'songs',
      itemCount: 8,
      seed: 3,
    })
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items.length).toBeLessThanOrEqual(8)
    for (const item of data.items) {
      expect(restore(item.displayTitle, item.answer)).toBe(item.fullTitle)
    }
  })

  it('curated bank still fills itemCount=20 when the era slice is short', () => {
    // Mixed 1990s bank has only 19 titles — must widen to other eras.
    const data = loadCuratedBank({
      category: 'mixed',
      era: '1990s',
      itemCount: 20,
      seed: 1,
    })
    expect(data.items.length).toBe(20)
  })

  it('draws all 20 items when remoteData has 20', () => {
    resetObjectCounter()
    const remote: TitleCompleteResponse = { items: makeItems(20) }
    const [page] = titleCompleteTemplate.generate(
      { ...base, itemCount: 20 },
      CTX(remote),
    )
    const numbers = flattenObjects(page.objects).filter(
      (o) => o.studioRole === 'decoration' && /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(numbers.length).toBe(20)
    expect(harvestAnswers(page.objects).length).toBe(20)
  })

  it('exposes custom category/era fields and hides selects when on', () => {
    const keys = titleCompleteTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('source')
    expect(keys).toContain('customCategory')
    expect(keys).toContain('customCategoryText')
    expect(keys).toContain('customEra')
    expect(keys).toContain('customEraText')
    const categorySelect = titleCompleteTemplate.configSchema.find((f) => f.key === 'category')
    const categoryText = titleCompleteTemplate.configSchema.find(
      (f) => f.key === 'customCategoryText',
    )
    const eraSelect = titleCompleteTemplate.configSchema.find((f) => f.key === 'era')
    const eraText = titleCompleteTemplate.configSchema.find((f) => f.key === 'customEraText')
    expect(categorySelect?.visibleWhen?.({ ...base, customCategory: true })).toBe(false)
    expect(categoryText?.visibleWhen?.({ ...base, customCategory: true })).toBe(true)
    expect(eraSelect?.visibleWhen?.({ ...base, customEra: true })).toBe(false)
    expect(eraText?.visibleWhen?.({ ...base, customEra: true })).toBe(true)
  })

  it('drops Category Mix from the select and defaults to Songs', () => {
    const categorySelect = titleCompleteTemplate.configSchema.find((f) => f.key === 'category')
    expect(categorySelect?.default).toBe('songs')
    const values = (categorySelect?.options ?? []).map((o) => o.value)
    expect(values).toEqual(['songs', 'films', 'tv'])
    expect(values).not.toContain('mixed')
    expect(buildDefaultConfig(titleCompleteTemplate).category).toBe('songs')
  })

  it('prints the category under the instruction on the puzzle page', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(
      { ...base, category: 'films' },
      CTX(),
    )
    const labels = flattenObjects(page.objects).filter(
      (o) =>
        o.studioRole === 'decoration' &&
        String(o.text ?? '') === 'Films' &&
        o.fontWeight === 700,
    )
    expect(labels.length).toBe(1)
  })

  it('prints a custom category label when Custom category is on', () => {
    resetObjectCounter()
    const [page] = titleCompleteTemplate.generate(
      {
        ...base,
        customCategory: true,
        customCategoryText: 'Broadway musicals',
      },
      CTX(),
    )
    expect(
      flattenObjects(page.objects).some(
        (o) =>
          o.studioRole === 'decoration' &&
          String(o.text ?? '') === 'Broadway musicals',
      ),
    ).toBe(true)
  })

  it('validateConfig requires custom category text and decade-shaped era', () => {
    expect(
      titleCompleteTemplate.validateConfig?.({
        ...base,
        customCategory: true,
        customCategoryText: '   ',
      }),
    ).toMatchObject({ field: 'customCategoryText' })
    expect(
      titleCompleteTemplate.validateConfig?.({
        ...base,
        customCategory: true,
        customCategoryText: 'Broadway musicals',
      }),
    ).toBeNull()
    expect(
      titleCompleteTemplate.validateConfig?.({
        ...base,
        customEra: true,
        customEraText: '   ',
      }),
    ).toMatchObject({ field: 'customEraText' })
    expect(
      titleCompleteTemplate.validateConfig?.({
        ...base,
        customEra: true,
        customEraText: 'the 2010s',
      }),
    ).toBeNull()
    expect(
      titleCompleteTemplate.validateConfig?.({
        ...base,
        customEra: true,
        customEraText: 'not-a-decade',
      }),
    ).toMatchObject({ field: 'customEraText' })
  })
})
