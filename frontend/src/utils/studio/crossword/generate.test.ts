import { describe, it, expect } from 'vitest'
import { crosswordTemplate } from './generate'
import {
  listCrosswordThemeMeta,
  loadThemeEntries,
  sanitizeCustomPairs,
  packingBudget,
} from './words'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(crosswordTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) =>
    o.type === 'group' && o.objects ? flatten(o.objects) : [o],
  )
}

function rectCovers(bar: StudioFabricObject, x: number, y: number): boolean {
  const left = bar.left ?? 0
  const top = bar.top ?? 0
  const right = left + (bar.width ?? 0)
  const bottom = top + (bar.height ?? 0)
  return x >= left - 0.01 && x <= right + 0.01 && y >= top - 0.01 && y <= bottom + 0.01
}

function textBox(obj: StudioFabricObject): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const width = obj.width ?? 0
  const height = obj.height ?? Number(obj.fontSize ?? 0)
  const left = obj.originX === 'center' ? (obj.left ?? 0) - width / 2 : (obj.left ?? 0)
  const top = obj.originY === 'center' ? (obj.top ?? 0) - height / 2 : (obj.top ?? 0)
  return { left, top, right: left + width, bottom: top + height }
}

function boxesSeparated(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  gap: number,
): boolean {
  return a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top
}

runGeneratorContractTests(crosswordTemplate)

describe('crossword', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = crosswordTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = crosswordTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(crosswordTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      crosswordTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('one hidden answer letter per white cell', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects).filter((o) => o.type === 'textbox')
    expect(answers.length).toBeGreaterThan(10)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => /^[A-Z]$/.test(String(o.text ?? '')))).toBe(true)
  })

  it('every difficulty and both sources generate', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      resetObjectCounter()
      const [page] = crosswordTemplate.generate({ ...base, difficulty }, CTX())
      expect(JSON.stringify(page)).not.toContain(
        'Could not build an interlocking crossword',
      )
    }
    resetObjectCounter()
    const [customPage] = crosswordTemplate.generate(
      {
        ...base,
        source: 'custom',
        words: [
          'TIGER | Big striped cat',
          'EAGLE | Bird of prey',
          'HORSE | Farm animal you ride',
          'SNAKE | Legsless reptile',
          'WHALE | Huge ocean mammal',
          'MOUSE | Tiny rodent',
          'SHEEP | Woolly farm animal',
          'GOOSE | Honking waterbird',
        ],
      },
      CTX(),
    )
    expect(JSON.stringify(customPage)).not.toContain(
      'Could not build an interlocking crossword',
    )
  })

  it('uses AI words+clues from remoteData', () => {
    resetObjectCounter()
    const remote = [
      { word: 'SHELL', clue: 'Beach find' },
      { word: 'WAVE', clue: 'Ocean motion' },
      { word: 'SAND', clue: 'Beach ground' },
      { word: 'CRAB', clue: 'Sideways walker' },
      { word: 'TIDE', clue: 'Ocean rise and fall' },
      { word: 'SURF', clue: 'Ride the waves' },
    ]
    const [page] = crosswordTemplate.generate(
      {
        ...base,
        customTheme: true,
        customThemeText: 'things at the beach',
      },
      { ...CTX(), remoteData: remote },
    )
    const json = JSON.stringify(page)
    expect(json).toContain('Beach find')
    expect(json).toContain('Ocean motion')
    expect(json).not.toContain('Could not build an interlocking crossword')
  })

  it('falls back to bundled theme when remoteData is missing', () => {
    resetObjectCounter()
    const pages = crosswordTemplate.generate(base, CTX())
    expect(pages[0]!.objects.length).toBeGreaterThan(0)
  })

  it('does not expose dictionary clueSource', () => {
    const keys = crosswordTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('clueSource')
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(crosswordTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('crossword')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('groups the letter grid into a movable unit', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBeGreaterThanOrEqual(1)
    const grid = groups.find((g) =>
      (g.objects ?? []).some((c) => c.studioRole === 'answer'),
    )
    expect(grid).toBeTruthy()
  })

  it('centers the grid horizontally above the clue lists', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = crosswordTemplate.generate(base, ctx)
    const grid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)

    const clueRoot = page!.objects.find(
      (o) =>
        o.type === 'group' &&
        (o.objects ?? []).some(
          (col) =>
            col.type === 'group' &&
            (col.objects ?? []).some((c) => c.text === 'ACROSS'),
        ),
    )!
    expect(clueRoot.top!).toBeGreaterThan(grid.top! + grid.height!)
  })

  it('groups ACROSS and DOWN columns, then groups both and centers them', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const clueRoot = page!.objects.find(
      (o) =>
        o.type === 'group' &&
        (o.objects ?? []).some(
          (col) =>
            col.type === 'group' &&
            (col.objects ?? []).some((c) => c.text === 'ACROSS' || c.text === 'DOWN'),
        ),
    )
    expect(clueRoot).toBeTruthy()
    const columns = (clueRoot!.objects ?? []).filter((o) => o.type === 'group')
    expect(columns.length).toBe(2)
    expect(
      columns.some((col) => (col.objects ?? []).some((c) => c.text === 'ACROSS')),
    ).toBe(true)
    expect(
      columns.some((col) => (col.objects ?? []).some((c) => c.text === 'DOWN')),
    ).toBe(true)
  })

  it('solution page omits clue lists', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    expect(page!.answerSourceObjects).toBeTruthy()
    const keyObjects = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const texts = flatten(keyObjects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts).not.toContain('ACROSS')
    expect(texts).not.toContain('DOWN')
    expect(texts.some((t) => /^\d+\.\s/.test(t))).toBe(false)
    expect(harvestAnswers(keyObjects).length).toBeGreaterThan(0)
  })

  it('solution grid is larger than the puzzle grid and centered in the body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, title: 'Animals' }
    const [page] = crosswordTemplate.generate(config, ctx)
    const puzzleGrid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const solutionGrid = page!.answerSourceObjects!.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    expect(solutionGrid.width!).toBeGreaterThan(puzzleGrid.width!)
    expect(solutionGrid.height!).toBeGreaterThan(puzzleGrid.height!)

    const tag: StudioTag = {
      templateKey: 'crossword',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      '',
    ).body
    const gridCenterX = solutionGrid.left! + solutionGrid.width! / 2
    const gridCenterY = solutionGrid.top! + solutionGrid.height! / 2
    expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)

    const fills = flatten(solutionGrid.objects ?? []).filter(
      (o) => o.type === 'rect' && o.fill === STUDIO_PAPER && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE,
    )
    const minL = Math.min(...fills.map((f) => f.left ?? 0))
    const maxR = Math.max(...fills.map((f) => (f.left ?? 0) + (f.width ?? 0)))
    const minT = Math.min(...fills.map((f) => f.top ?? 0))
    const maxB = Math.max(...fills.map((f) => (f.top ?? 0) + (f.height ?? 0)))
    expect(Math.abs(maxR - minL - solutionGrid.width!)).toBeLessThanOrEqual(2)
    expect(Math.abs(maxB - minT - solutionGrid.height!)).toBeLessThanOrEqual(2)
  })

  it('grid bars use Grid Copy mid-gray hairlines', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const bars = flatten(page!.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        ((o.width === STUDIO_STROKE_HAIRLINE && (o.height ?? 0) > STUDIO_STROKE_HAIRLINE) ||
          (o.height === STUDIO_STROKE_HAIRLINE && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE)),
    )
    expect(bars.length).toBeGreaterThan(8)
  })

  it('closes every white-cell corner so bars share ink', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const grid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const children = flatten(grid.objects ?? [])
    const fills = children.filter(
      (o) => o.type === 'rect' && o.fill === STUDIO_PAPER && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE,
    )
    const bars = children.filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        ((o.width === STUDIO_STROKE_HAIRLINE && (o.height ?? 0) > STUDIO_STROKE_HAIRLINE) ||
          (o.height === STUDIO_STROKE_HAIRLINE && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE)),
    )
    expect(fills.length).toBeGreaterThan(8)
    for (const cell of fills) {
      const corners = [
        { x: cell.left!, y: cell.top! },
        { x: cell.left! + cell.width!, y: cell.top! },
        { x: cell.left!, y: cell.top! + cell.height! },
        { x: cell.left! + cell.width!, y: cell.top! + cell.height! },
      ]
      for (const corner of corners) {
        const covered = bars.some((bar) => rectCovers(bar, corner.x, corner.y))
        expect(covered, `gap at ${corner.x},${corner.y}`).toBe(true)
      }
    }
  })

  it('keeps clue numbers from touching solution letters', () => {
    const denseWords = [
      'CAMEL | Desert animal with humps',
      'PIRATE | Seafaring robber on a ship',
      'TURTLE | Slow reptile with a shell',
      'PIZZA | Popular Italian dish with cheese',
      'GIRAFFE | Tall animal with a long neck',
      'ROCKET | Space vehicle that flies high',
      'GUITAR | Musical instrument with six strings',
      'DOCTOR | Medical professional who heals',
      'SUMMER | Warmest season of the year',
      'PENCIL | Writing tool made of wood',
      'OCEAN | Large body of salt water',
      'ELEPHANT | Large animal with a trunk',
      'CASTLE | Large stone building where kings lived',
      'BANANA | Yellow fruit with a peel',
      'PILOT | Person who flies an airplane',
      'RAINBOW | Colorful arc seen after rain',
      'LIBRARY | Place where people borrow books',
      'BUTTERFLY | Insect with colorful wings',
      'MOUNTAIN | Very high natural landform',
      'SUNFLOWER | Tall flower with a large yellow head',
    ]
    const configs = [
      base,
      { ...base, source: 'custom', words: denseWords },
    ]
    for (const config of configs) {
      resetObjectCounter()
      const [page] = crosswordTemplate.generate(config, CTX())
      const source = page!.answerSourceObjects ?? page!.objects
      const grid = source.find(
        (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
      )!
      const children = flatten(grid.objects ?? [])
      const fills = children.filter(
        (o) => o.type === 'rect' && o.fill === STUDIO_PAPER && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE,
      )
      const letters = children.filter((o) => o.studioRole === 'answer' && o.type === 'textbox')
      const numbers = children.filter(
        (o) => o.studioRole === 'prompt' && o.type === 'textbox' && /^\d+$/.test(String(o.text ?? '')),
      )
      expect(numbers.length).toBeGreaterThan(0)
      for (const number of numbers) {
        const fill = fills.find((cell) => rectCovers(cell, number.left! + 1, number.top! + 1))
        expect(fill).toBeTruthy()
        const letter = letters.find((glyph) => rectCovers(fill!, glyph.left!, glyph.top!))
        expect(letter).toBeTruthy()
        expect(boxesSeparated(textBox(number), textBox(letter!), 2)).toBe(true)
      }
    }
  }, 30_000)

  it(
    'max density (15 words, hard) stays inside safe margin',
    () => {
      resetObjectCounter()
      expect(() =>
        crosswordTemplate.generate(
          {
            ...base,
            wordCount: 15,
            difficulty: 'hard',
            theme: 'animals',
          },
          CTX(),
        ),
      ).not.toThrow()
    },
    20_000,
  )

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('crossword')).toBe(true)
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects).filter((o) => o.type === 'textbox')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('renders the selected Number of words as clues', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate({ ...base, wordCount: 9 }, CTX())
    const clueLines = flatten(page!.objects)
      .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .filter((t) => /^\d+\.\s/.test(t))
    expect(clueLines).toHaveLength(9)
  })

  it(
    'honors Number of words at the slider max',
    () => {
      resetObjectCounter()
      const [page] = crosswordTemplate.generate(
        { ...base, wordCount: 15, difficulty: 'hard', theme: 'animals' },
        CTX(),
      )
      const clueLines = flatten(page!.objects)
        .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
        .map((o) => String(o.text ?? ''))
        .filter((t) => /^\d+\.\s/.test(t))
      expect(clueLines).toHaveLength(15)
    },
    30_000,
  )

  it('caps Number of words at 15', () => {
    const wordCountField = crosswordTemplate.configSchema.find((f) => f.key === 'wordCount')
    expect(wordCountField?.max).toBe(15)
  })

  it('sizes clue textboxes tall enough that descenders are not clipped', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const clues = flatten(page!.objects).filter(
      (o) =>
        o.studioRole === 'prompt' &&
        o.type === 'textbox' &&
        /^\d+\.\s/.test(String(o.text ?? '')),
    )
    expect(clues.length).toBeGreaterThan(0)
    for (const clue of clues) {
      const fontSize = Number(clue.fontSize ?? 0)
      expect(Number(clue.height ?? 0)).toBeGreaterThanOrEqual(Math.ceil(fontSize * 1.35))
    }
    const clueRoot = page!.objects.find(
      (o) =>
        o.type === 'group' &&
        (o.objects ?? []).some(
          (col) =>
            col.type === 'group' &&
            (col.objects ?? []).some((c) => c.text === 'ACROSS'),
        ),
    )!
    const columns = (clueRoot.objects ?? []).filter((o) => o.type === 'group')
    for (const col of columns) {
      const texts = (col.objects ?? []).filter((o) => o.type === 'textbox')
      const tallest = texts.reduce((max, t) => Math.max(max, Number(t.height ?? 0)), 0)
      expect(col.height!).toBeGreaterThan(tallest)
    }
  })

  it('clue lines omit the letter-count suffix', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const prompts = flatten(page!.objects)
      .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    const clueLines = prompts.filter((t) => /^\d+\.\s/.test(t))
    expect(clueLines.length).toBeGreaterThan(0)
    expect(clueLines.every((t) => !/\(\d+\)$/.test(t))).toBe(true)
  })

  it('validateConfig rejects too few custom words', () => {
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: [
          'CAT | Small pet',
          'DOG | Loyal friend',
          'BIRD | Feathered flyer',
        ],
      }),
    ).toMatchObject({ field: 'words', message: expect.stringMatching(/at least 6/i) })
  })

  it('blocks generate when custom words exceed the packing budget', () => {
    const budget = packingBudget()
    // Distinct A–Z answers (3–12 letters) so sanitize keeps every line.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const longList = Array.from({ length: budget + 1 }, (_, i) => {
      const a = alphabet[i % 26]!
      const b = alphabet[Math.floor(i / 26) % 26]!
      const c = alphabet[Math.floor(i / (26 * 26)) % 26]!
      const word = `${a}${b}${c}X`
      return `${word} | Clue for ${word}`
    })
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: longList,
      }),
    ).toMatchObject({
      field: 'words',
      message: expect.stringMatching(new RegExp(`fits at most ${budget} words`)),
    })
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: longList.slice(0, budget),
      }),
    ).toBeNull()
  })

  it(
    'places every custom word from a full 20-line list (no silent drops)',
    () => {
      const words = [
        'APPLE | A round fruit that can be red or green',
        'TIGER | A large wild cat with black stripes',
        'OCEAN | A very large body of salt water',
        'CASTLE | A large building where kings and queens once lived',
        'ROCKET | A vehicle designed to travel into space',
        'GARDEN | A place where flowers and plants are grown',
        'PENCIL | A tool used for writing or drawing',
        'RABBIT | A small animal with long ears',
        'ISLAND | A piece of land surrounded by water',
        'WINDOW | An opening in a wall that lets in light',
        'DRAGON | A mythical creature often shown with wings',
        'CANDLE | A stick of wax with a wick that gives light',
        'BRIDGE | A structure built to cross over water or roads',
        'FOREST | A large area covered with many trees',
        'BUTTON | A small object used to fasten clothing',
        'PLANET | A large round object that moves around a star',
        'CAMERA | A device used to take photographs',
        'PILLOW | A soft object used to support your head while sleeping',
        'MARKET | A place where people buy and sell goods',
        'TURTLE | An animal with a hard shell on its back',
      ]
      expect(crosswordTemplate.validateConfig?.({ ...base, source: 'custom', words })).toBeNull()

      for (const seed of [1, 7, 42, 99]) {
        resetObjectCounter()
        const [page] = crosswordTemplate.generate(
          { ...base, source: 'custom', words, difficulty: 'medium' },
          { ...CTX(), seed },
        )
        const texts = flatten(page!.objects)
          .filter((o) => o.type === 'textbox')
          .map((o) => String(o.text ?? ''))
        expect(texts.some((t) => /Could not interlock/i.test(t))).toBe(false)
        const clueLines = texts.filter((t) => /^\d+\.\s/.test(t))
        expect(clueLines, `seed ${seed}`).toHaveLength(20)
        expect(clueLines.some((t) => /wild cat with black stripes/i.test(t))).toBe(true)
        expect(clueLines.some((t) => /land surrounded by water/i.test(t))).toBe(true)
      }
    },
    60_000,
  )

  it('validateConfig rejects a bare word without WORD | clue', () => {
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: [
          'APPLE | A round fruit that can be red or green',
          'TIGER | A large wild cat with orange and black stripes',
          'OCEAN | A very large body of salt water',
          'SCHOOL | A place where children go to learn',
          'CASTLE | A large stone building where kings or queens lived',
          'ROCKET | A vehicle that travels into space',
          'GARDEN | A place where flowers and plants are grown',
          'String',
        ],
      }),
    ).toMatchObject({
      field: 'words',
      message: expect.stringMatching(/String.*WORD \| clue/i),
    })
  })

  it('validateConfig requires custom theme text when toggle is on', () => {
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        source: 'theme',
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toMatchObject({ field: 'customThemeText' })
  })

  it('exposes Custom theme toggle plus preset/own-words sources', () => {
    const keys = crosswordTemplate.configSchema.map((f) => f.key)
    expect(keys).toContain('source')
    expect(keys).toContain('customTheme')
    expect(keys).toContain('customThemeText')
    const toggle = crosswordTemplate.configSchema.find((f) => f.key === 'customTheme')
    expect(toggle?.type).toBe('toggle')
  })

  it('sanitizeCustomPairs parses WORD | clue lines and skips bare words', () => {
    expect(
      sanitizeCustomPairs(['cat | Small pet', 'DOG: Loyal friend', 'BIRD', 'FISH |']),
    ).toEqual([
      { word: 'CAT', clue: 'Small pet' },
      { word: 'DOG', clue: 'Loyal friend' },
      { word: 'FISH', clue: '' },
    ])
  })

  it('custom words field documents WORD | clue, import, and packing budget', () => {
    const wordsField = crosswordTemplate.configSchema.find((f) => f.key === 'words')
    const emptyHelp = wordsField?.helpWhen?.({ source: 'custom', words: [] })
    expect(emptyHelp).toMatch(/WORD \| clue/i)
    expect(emptyHelp).toMatch(/\.txt/i)
    expect(emptyHelp).toMatch(new RegExp(`0/${packingBudget()} words`))
    expect(wordsField?.placeholder).toMatch(/\|/)
    expect(
      wordsField?.warningWhen?.({ source: 'custom', words: [] }),
    ).toMatch(/Max \d+ words/)
    expect(
      wordsField?.warningWhen?.({
        source: 'custom',
        words: ['TIGER | Big striped cat', 'BAD', 'EAGLE | Bird of prey'],
      }),
    ).toMatch(/1 line skipped/)
  })

  it('ships 10 themes with at least 500 word+clue pairs each (word-search parity)', () => {
    const meta = listCrosswordThemeMeta()
    expect(meta).toHaveLength(10)
    expect(meta.map((m) => m.key)).toEqual([
      'animals',
      'food',
      'nature',
      'household',
      'body',
      'sports',
      'travel',
      'school',
      'music',
      'space',
    ])
    for (const entry of meta) {
      const pairs = loadThemeEntries(entry.key)
      expect(pairs.length).toBeGreaterThanOrEqual(500)
      expect(pairs.length).toBe(entry.count)
      expect(
        pairs.every(
          (p) => /^[A-Z]{3,12}$/.test(p.word) && p.clue.trim().length > 0,
        ),
      ).toBe(true)
    }
  })

  it('every theme generates without throwing', () => {
    for (const entry of listCrosswordThemeMeta()) {
      resetObjectCounter()
      expect(() =>
        crosswordTemplate.generate(
          { ...base, theme: entry.key, customTheme: false },
          CTX(),
        ),
      ).not.toThrow()
    }
  })
})
