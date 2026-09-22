import { describe, it, expect } from 'vitest'
import { crosswordTemplate } from './generate'
import {
  clueContainsAnswerFamily,
  isValidClueText,
  normalizeAnswerDisplay,
  themeIpWarning,
} from './content-quality'
import { selectCrosswordCandidates, sharedLetterCount } from './candidate-selector'
import { CROSSWORD_LEVELS, parseCrosswordLevel } from './levels'
import {
  CLUE_MIN_SIZE,
  GRID_MAX_SIDE,
  GRID_MIN_CELL,
  crosswordPagePlan,
  crosswordPrintNote,
} from './layout'
import {
  CROSSWORD_THEME_CUSTOM,
  CROSSWORD_THEME_MIXED,
  parseCrosswordThemeChoice,
  resolveCrosswordTheme,
} from './theme'
import { instructionFor, validateCrosswordConfig } from './config'
import { FIXTURE_PAIRS } from './fixture'
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
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { drawHeader } from '../studio-layout'
import { crosswordContentBox } from './layout'
import type {
  StudioConfigLayoutContext,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { CrosswordPair } from './types'

const CTX = (remoteData: CrosswordPair[] = FIXTURE_PAIRS): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData,
})

/** Every KDP trim a seller can pick, at the margins this app sets. */
const TRIMS: [string, number, number][] = [
  ['5 x 8', 5, 8],
  ['5.5 x 8.5', 5.5, 8.5],
  ['6 x 9', 6, 9],
  ['7 x 10', 7, 10],
  ['7.5 x 9.25', 7.5, 9.25],
  ['8.5 x 11', 8.5, 11],
]

function trimContext(widthInches: number, heightInches: number): StudioGenerateContext {
  return {
    pageWidth: Math.round(widthInches * DPI),
    pageHeight: Math.round(heightInches * DPI),
    margin: {
      top: Math.round(0.25 * DPI),
      bottom: Math.round(0.25 * DPI),
      left: Math.round(0.375 * DPI),
      right: Math.round(0.25 * DPI),
    },
    seed: 42,
    instanceId: 'test-run',
    remoteData: FIXTURE_PAIRS,
  }
}

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

function clueTexts(objects: StudioFabricObject[]): string[] {
  return flatten(objects)
    .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
    .map((o) => String(o.text ?? ''))
    .filter((t) => /^\d+\.\s/.test(t))
}

function clueObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return flatten(objects).filter(
    (o) =>
      o.studioRole === 'prompt' &&
      o.type === 'textbox' &&
      /^\d+\.\s/.test(String(o.text ?? '')),
  )
}

function gridGroup(objects: StudioFabricObject[]): StudioFabricObject {
  return objects.find(
    (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
  )!
}

/**
 * Rebuild the puzzle from what the solution page actually draws: white cells
 * on a lattice, a letter in each, and a number in the corner of every square a
 * clue starts at. Reading the page back is the only check that catches a grid,
 * a clue list and an answer key that were each built correctly but from
 * different data.
 */
function readSolutionLattice(objects: StudioFabricObject[]) {
  const children = flatten(gridGroup(objects).objects ?? [])
  const cells = children.filter((o) => o.type === 'rect' && o.fill === STUDIO_PAPER)
  const size = Math.min(...cells.map((c) => c.width ?? 0))
  const originX = Math.min(...cells.map((c) => c.left ?? 0))
  const originY = Math.min(...cells.map((c) => c.top ?? 0))
  const key = (row: number, col: number) => `${row},${col}`
  const cellAt = (o: StudioFabricObject) => ({
    row: Math.round(((o.top ?? 0) - originY) / size),
    col: Math.round(((o.left ?? 0) - originX) / size),
  })

  const letters = new Map<string, string>()
  for (const letter of children.filter(
    (o) => o.studioRole === 'answer' && o.type === 'textbox',
  )) {
    // Letters are centred in their cell; step back to the cell's top-left.
    const at = cellAt({
      ...letter,
      left: (letter.left ?? 0) - size / 2,
      top: (letter.top ?? 0) - size / 2,
    })
    letters.set(key(at.row, at.col), String(letter.text ?? ''))
  }

  const starts = new Map<number, { row: number; col: number }>()
  for (const number of children.filter(
    (o) => o.studioRole === 'prompt' && /^\d+$/.test(String(o.text ?? '')),
  )) {
    const cell = cells.find((c) => rectCovers(c, (number.left ?? 0) + 1, (number.top ?? 0) + 1))
    if (cell) starts.set(Number(number.text), cellAt(cell))
  }

  return {
    startOf: (n: number) => starts.get(n),
    /** The whole run through `start`, so an answer that overruns its clue shows up. */
    readRun(start: { row: number; col: number }, dir: 'across' | 'down'): string {
      const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0]
      // A numbered square always begins its run, so walk forward only.
      let out = ''
      for (let i = 0; ; i++) {
        const glyph = letters.get(key(start.row + dr * i, start.col + dc * i))
        if (glyph === undefined) break
        out += glyph
      }
      return out
    },
  }
}

/** Clue numbers and answer lengths, split by the list they were printed in. */
function readClueLists(objects: StudioFabricObject[]) {
  const lists: Record<'across' | 'down', { number: number; length: number }[]> = {
    across: [],
    down: [],
  }
  for (const group of objects.filter((o) => o.type === 'group')) {
    const children = group.objects ?? []
    const title = children.find((o) => /^(ACROSS|DOWN)$/.test(String(o.text ?? '')))
    if (!title) continue
    const dir = String(title.text) === 'ACROSS' ? 'across' : 'down'
    for (const text of children
      .map((o) => String(o.text ?? '').replace(/\n/g, ' '))
      .filter((t) => /^\d+\.\s/.test(t))) {
      lists[dir].push({
        number: Number(text.match(/^(\d+)\./)![1]),
        length: Number(text.match(/\((\d+)\)$/)![1]),
      })
    }
  }
  return lists
}

function rectCovers(bar: StudioFabricObject, x: number, y: number): boolean {
  const left = bar.left ?? 0
  const top = bar.top ?? 0
  return (
    x >= left - 0.01 &&
    x <= left + (bar.width ?? 0) + 0.01 &&
    y >= top - 0.01 &&
    y <= top + (bar.height ?? 0) + 0.01
  )
}

function textBox(obj: StudioFabricObject) {
  const width = obj.width ?? 0
  const height = obj.height ?? Number(obj.fontSize ?? 0)
  const left = obj.originX === 'center' ? (obj.left ?? 0) - width / 2 : (obj.left ?? 0)
  const top = obj.originY === 'center' ? (obj.top ?? 0) - height / 2 : (obj.top ?? 0)
  return { left, top, right: left + width, bottom: top + height }
}

function boxesSeparated(
  a: ReturnType<typeof textBox>,
  b: ReturnType<typeof textBox>,
  gap: number,
): boolean {
  return (
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  )
}

runGeneratorContractTests(crosswordTemplate, {
  contextOverrides: { remoteData: FIXTURE_PAIRS },
})

// Two crosswords printed from the same pool must still be two crosswords: a
// book that repeats a grid is a book KDP can reject as duplicate content.
assertGeneratorEntropy(crosswordTemplate, {
  seeds: 60,
  contextOverrides: { remoteData: FIXTURE_PAIRS },
})

describe('retirement crossword form', () => {
  it('asks two questions: a theme and a level', () => {
    const keys = crosswordTemplate.configSchema.map((f) => f.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level'])
  })

  it('drops the knobs the page size now decides', () => {
    const keys = new Set(getStudioTemplate('crossword')!.configSchema.map((f) => f.key))
    for (const removed of [
      'printStyle',
      'answerCount',
      'wordCount',
      'difficulty',
      'retirementCategory',
      'presetThemeId',
      'writeOwnTheme',
      'includeAnswerKey',
      'answerKeyForAll',
    ]) {
      expect(keys.has(removed), removed).toBe(false)
    }
  })

  it('defaults to mixed themes at the classic level', () => {
    const defaults = buildDefaultConfig(crosswordTemplate)
    expect(defaults.theme).toBe(CROSSWORD_THEME_MIXED)
    expect(defaults.level).toBe('classic')
    expect(defaults.customTheme).toBe('')
  })

  it('shows the custom theme field only when it is chosen', () => {
    const field = crosswordTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(field.visibleWhen?.({ theme: CROSSWORD_THEME_MIXED })).toBe(false)
    expect(field.visibleWhen?.({ theme: CROSSWORD_THEME_CUSTOM })).toBe(true)
  })

  it('requires theme text once the seller opts into writing one', () => {
    expect(
      validateCrosswordConfig({ theme: CROSSWORD_THEME_CUSTOM, customTheme: '  ' }),
    ).toMatchObject({ field: 'customTheme' })
    expect(
      validateCrosswordConfig({ theme: CROSSWORD_THEME_CUSTOM, customTheme: 'Garden days' }),
    ).toBeNull()
    expect(validateCrosswordConfig({ theme: CROSSWORD_THEME_MIXED })).toBeNull()
  })

  it('warns on IP-risky custom themes without blocking generate', () => {
    const field = crosswordTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(field.warningWhen?.({ customTheme: 'Disney Retirement' })).toMatch(
      /intellectual property/i,
    )
    expect(field.warningWhen?.({ customTheme: 'Retirement Gardening' })).toBeNull()
  })

  it('reads a config saved against the old category form', () => {
    const legacy = {
      writeOwnTheme: false,
      retirementCategory: 'travel-adventure',
      presetThemeId: 'road-trips',
      difficulty: 'challenge',
      printStyle: 'standard',
    }
    expect(parseCrosswordThemeChoice(legacy)).toBe('road-trips')
    expect(resolveCrosswordTheme(legacy, 1).label).toBe('Road Trips')
    expect(parseCrosswordLevel(legacy).id).toBe('challenging')
    expect(parseCrosswordLevel({ writeOwnTheme: true, difficulty: 'relaxed' }).id).toBe(
      'gentle',
    )
  })

  it('rotates a different theme per puzzle on the mixed default', () => {
    const labels = new Set(
      Array.from({ length: 12 }, (_, i) =>
        resolveCrosswordTheme({ theme: CROSSWORD_THEME_MIXED }, 1_000 + i * 7_919).label,
      ),
    )
    expect(labels.size).toBeGreaterThan(6)
    // Same seed, same theme — a redraw of one sheet must not change its subject.
    expect(resolveCrosswordTheme({ theme: CROSSWORD_THEME_MIXED }, 99).label).toBe(
      resolveCrosswordTheme({ theme: CROSSWORD_THEME_MIXED }, 99).label,
    )
  })

  it('tells the seller what the chosen page size will print', () => {
    const layout: StudioConfigLayoutContext = {
      pageWidth: Math.round(8.5 * DPI),
      pageHeight: Math.round(11 * DPI),
      margin: {
        top: 24,
        bottom: 24,
        left: 36,
        right: 24,
      },
    }
    const config = { title: 'Game 1', showTitle: true, showInstructions: true }
    const note = crosswordPrintNote(
      parseCrosswordLevel({ level: 'classic' }),
      layout,
      config,
      instructionFor(config),
    )
    const plan = crosswordPagePlan({
      page: layout,
      config,
      instruction: instructionFor(config),
      level: parseCrosswordLevel({ level: 'classic' }),
    })
    expect(note).toContain(`${plan.answerCount} answers`)
    expect(note).toMatch(/\d+ pt/)
  })
})

describe('retirement crossword page', () => {
  it('is deterministic and varies by seed', () => {
    resetObjectCounter()
    const a = crosswordTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = crosswordTemplate.generate(base, CTX())
    expect(a).toEqual(b)

    resetObjectCounter()
    const c = JSON.stringify(
      crosswordTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(JSON.stringify(a)).not.toEqual(c)
  })

  it('hides one answer letter per white cell', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects).filter((o) => o.type === 'textbox')
    expect(answers.length).toBeGreaterThan(10)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => /^[A-Z]$/.test(String(o.text ?? '')))).toBe(true)
  })

  it('prints ACROSS and DOWN clues under the grid', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = crosswordTemplate.generate(base, ctx)
    const texts = flatten(page!.objects).map((o) => String(o.text ?? ''))
    expect(texts).toContain('ACROSS')
    expect(texts).toContain('DOWN')

    // One clue per placed answer, and the two lists are separate groups so a
    // seller can nudge either without dragging the grid.
    const clues = clueObjects(page!.objects)
    expect(clues.length).toBeGreaterThan(0)
    expect(page!.objects.filter((o) => o.type === 'group')).toHaveLength(3)
  })

  it('numbers every clue and matches it to a grid number', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const gridNumbers = new Set(
      flatten(gridGroup(page!.objects).objects ?? [])
        .filter((o) => o.studioRole === 'prompt' && /^\d+$/.test(String(o.text ?? '')))
        .map((o) => String(o.text)),
    )
    const clueNumbers = clueTexts(page!.objects).map((t) => t.match(/^(\d+)\./)![1]!)
    expect(clueNumbers.length).toBeGreaterThan(0)
    for (const number of clueNumbers) {
      expect(gridNumbers.has(number), `clue ${number} has no grid square`).toBe(true)
    }
  })

  it('ends every clue with its answer length', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    for (const clue of clueTexts(page!.objects)) {
      expect(clue.replace(/\n/g, ' ')).toMatch(/\(\d+\)$/)
    }
  })

  it('keeps clue type at or above the large-print floor on every trim', () => {
    for (const [label, width, height] of TRIMS) {
      for (const level of CROSSWORD_LEVELS) {
        resetObjectCounter()
        const ctx = trimContext(width, height)
        const [page] = crosswordTemplate.generate({ ...base, level: level.id }, ctx)
        const clues = clueObjects(page!.objects)
        expect(clues.length, `${label} ${level.id}`).toBeGreaterThan(0)
        for (const clue of clues) {
          expect(
            Number(clue.fontSize ?? 0),
            `${label} ${level.id} clue at ${clue.fontSize}`,
          ).toBeGreaterThanOrEqual(CLUE_MIN_SIZE)
        }
      }
    }
  })

  it('keeps the whole page inside the safe margin on every trim', () => {
    // Both headings are optional, and turning them off hands the puzzle a
    // taller column — the layout has to hold up either way.
    const headers = [
      { showTitle: true, showInstructions: true },
      { showTitle: false, title: '', showInstructions: false },
    ]
    for (const [label, width, height] of TRIMS) {
      for (const level of CROSSWORD_LEVELS) {
        for (const header of headers) {
          resetObjectCounter()
          const ctx = trimContext(width, height)
          const [page] = crosswordTemplate.generate(
            { ...base, ...header, level: level.id },
            ctx,
          )
          expect(JSON.stringify(page), label).not.toMatch(/Could not interlock/i)
          assertObjectsInSafeMargin(page!.objects, ctx)
          assertObjectsInSafeMargin(
            buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO),
            ctx,
          )
        }
      }
    }
  })

  it('never overlaps the grid with the clue lists', () => {
    for (const [label, width, height] of TRIMS) {
      resetObjectCounter()
      const ctx = trimContext(width, height)
      const [page] = crosswordTemplate.generate(base, ctx)
      const grid = gridGroup(page!.objects)
      const gridBottom = grid.top! + grid.height!
      const columns = page!.objects.filter(
        (o) => o.type === 'group' && o !== grid,
      )
      expect(columns.length, label).toBeGreaterThan(0)
      for (const column of columns) {
        expect(column.top!, label).toBeGreaterThanOrEqual(gridBottom)
      }
    }
  })

  it('never packs a grid past the layout ceiling or below a writable cell', () => {
    for (const [label, width, height] of TRIMS) {
      for (const level of CROSSWORD_LEVELS) {
        resetObjectCounter()
        const ctx = trimContext(width, height)
        const [page] = crosswordTemplate.generate({ ...base, level: level.id }, ctx)
        const grid = gridGroup(page!.objects)
        const cells = flatten(grid.objects ?? []).filter(
          (o) => o.type === 'rect' && o.fill === STUDIO_PAPER,
        )
        const cell = Math.min(...cells.map((c) => c.width ?? 0))
        expect(cell, `${label} ${level.id}`).toBeGreaterThanOrEqual(GRID_MIN_CELL - 1)
        expect(grid.width! / cell, `${label} ${level.id}`).toBeLessThanOrEqual(
          GRID_MAX_SIDE + 0.5,
        )
      }
    }
  })

  it('lowers the answer count rather than the type size on a small trim', () => {
    const small = crosswordPagePlan({
      page: trimContext(5, 8),
      config: { title: 'Game 1', showTitle: true, showInstructions: true },
      instruction: instructionFor({}),
      level: parseCrosswordLevel({ level: 'classic' }),
    })
    const large = crosswordPagePlan({
      page: trimContext(8.5, 11),
      config: { title: 'Game 1', showTitle: true, showInstructions: true },
      instruction: instructionFor({}),
      level: parseCrosswordLevel({ level: 'classic' }),
    })
    expect(small.answerCount).toBeLessThan(large.answerCount)
    expect(small.clueFontSize).toBeGreaterThanOrEqual(CLUE_MIN_SIZE)
  })

  it('shows a visible message when the clue API returned nothing', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, {
      ...CTX(),
      remoteData: undefined,
    })
    expect(JSON.stringify(page)).toMatch(/couldn't write enough clear crossword clues/i)
  })
})

describe('retirement crossword answer page', () => {
  it('is added automatically, with no form toggle', () => {
    expect(crosswordTemplate.producesAnswerKey).toBe(true)
    const keys = new Set(getStudioTemplate('crossword')!.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
  })

  it('prints the filled grid alone, in black ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('crossword')).toBe(true)
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const texts = flatten(keyObjects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts).not.toContain('ACROSS')
    expect(texts).not.toContain('DOWN')
    expect(texts.some((t) => /^\d+\.\s/.test(t))).toBe(false)

    const answers = harvestAnswers(keyObjects).filter((o) => o.type === 'textbox')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('spells out exactly the answers the clues asked for', () => {
    for (const [label, width, height] of TRIMS) {
      resetObjectCounter()
      const [page] = crosswordTemplate.generate(base, trimContext(width, height))
      const lattice = readSolutionLattice(page!.answerSourceObjects!)
      const clues = readClueLists(page!.objects)

      expect(clues.across.length + clues.down.length, label).toBeGreaterThan(0)
      for (const dir of ['across', 'down'] as const) {
        for (const clue of clues[dir]) {
          const start = lattice.startOf(clue.number)
          expect(start, `${label}: ${dir} ${clue.number} has no numbered square`).toBeTruthy()
          const run = lattice.readRun(start!, dir)
          // A run is only that clue's answer if nothing extends it either way.
          expect(run, `${label}: ${dir} ${clue.number} reads "${run}"`).toHaveLength(
            clue.length,
          )
          expect(/^[A-Z]+$/.test(run), `${label}: ${dir} ${clue.number}`).toBe(true)
        }
      }
    }
  })

  it('prints a solution grid at least as large as the puzzle grid', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, title: 'Travel Dreams' }
    const [page] = crosswordTemplate.generate(config, ctx)
    const puzzleGrid = gridGroup(page!.objects)
    const solutionGrid = gridGroup(page!.answerSourceObjects!)
    expect(solutionGrid.width!).toBeGreaterThanOrEqual(puzzleGrid.width!)
    expect(solutionGrid.height!).toBeGreaterThanOrEqual(puzzleGrid.height!)

    const tag: StudioTag = {
      templateKey: 'crossword',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(crosswordContentBox(ctx), config, tag, '').body
    expect(
      Math.abs(solutionGrid.left! + solutionGrid.width! / 2 - (field.left + field.width / 2)),
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(solutionGrid.top! + solutionGrid.height! / 2 - (field.top + field.height / 2)),
    ).toBeLessThanOrEqual(2)
  })
})

describe('retirement crossword ink', () => {
  it('centers the grid horizontally in the content column', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = crosswordTemplate.generate(base, ctx)
    const grid = gridGroup(page!.objects)
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const centerX = (contentLeft + contentRight) / 2
    expect(Math.abs(grid.left! + grid.width! / 2 - centerX)).toBeLessThanOrEqual(2)
  })

  it('closes every white-cell corner so bars share ink', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const children = flatten(gridGroup(page!.objects).objects ?? [])
    const fills = children.filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_PAPER &&
        (o.width ?? 0) > STUDIO_STROKE_HAIRLINE,
    )
    const bars = children.filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        ((o.width === STUDIO_STROKE_HAIRLINE && (o.height ?? 0) > STUDIO_STROKE_HAIRLINE) ||
          (o.height === STUDIO_STROKE_HAIRLINE && (o.width ?? 0) > STUDIO_STROKE_HAIRLINE)),
    )
    expect(fills.length).toBeGreaterThan(8)
    expect(bars.length).toBeGreaterThan(8)
    for (const cell of fills) {
      for (const corner of [
        { x: cell.left!, y: cell.top! },
        { x: cell.left! + cell.width!, y: cell.top! },
        { x: cell.left!, y: cell.top! + cell.height! },
        { x: cell.left! + cell.width!, y: cell.top! + cell.height! },
      ]) {
        expect(
          bars.some((bar) => rectCovers(bar, corner.x, corner.y)),
          `gap at ${corner.x},${corner.y}`,
        ).toBe(true)
      }
    }
  })

  it('keeps clue numbers clear of the solution letters', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const children = flatten(gridGroup(page!.answerSourceObjects!).objects ?? [])
    const fills = children.filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_PAPER &&
        (o.width ?? 0) > STUDIO_STROKE_HAIRLINE,
    )
    const letters = children.filter(
      (o) => o.studioRole === 'answer' && o.type === 'textbox',
    )
    const numbers = children.filter(
      (o) =>
        o.studioRole === 'prompt' &&
        o.type === 'textbox' &&
        /^\d+$/.test(String(o.text ?? '')),
    )
    expect(numbers.length).toBeGreaterThan(0)
    for (const number of numbers) {
      const fill = fills.find((cell) => rectCovers(cell, number.left! + 1, number.top! + 1))
      expect(fill).toBeTruthy()
      const letter = letters.find((glyph) => rectCovers(fill!, glyph.left!, glyph.top!))
      expect(letter).toBeTruthy()
      expect(boxesSeparated(textBox(number), textBox(letter!), 2)).toBe(true)
    }
  })
})

describe('retirement crossword content safety', () => {
  it('normalizes two-word phrases into grid tokens', () => {
    expect(normalizeAnswerDisplay('Road Trip')).toEqual({
      display: 'Road Trip',
      token: 'ROADTRIP',
      wordCount: 2,
    })
    expect(normalizeAnswerDisplay('Too Many Words Here')).toBeNull()
  })

  it('rejects clues that echo the answer family', () => {
    expect(clueContainsAnswerFamily('GARDEN', 'A garden space behind the house')).toBe(true)
    expect(clueContainsAnswerFamily('TRAVEL', 'What a traveler loves to do')).toBe(true)
    expect(clueContainsAnswerFamily('GARDEN', 'A place to grow flowers')).toBe(false)
    expect(isValidClueText('A place to grow flowers', 'GARDEN', 52)).toBe(true)
    expect(isValidClueText('A garden space', 'GARDEN', 52)).toBe(false)
  })

  it('keeps trademark-heavy themes out of the form without blocking it', () => {
    expect(themeIpWarning('Disney Retirement')).toMatch(/intellectual property/i)
    expect(themeIpWarning('Retirement Gardening')).toBeNull()
  })

  it('ranks candidates by shared-letter crossability', () => {
    expect(sharedLetterCount('GARDEN', 'ADVENTURE')).toBeGreaterThan(0)
    const selected = selectCrosswordCandidates(FIXTURE_PAIRS, 10)
    expect(selected.length).toBeGreaterThanOrEqual(10)
    expect(selected.every((p) => p.clue.length > 0)).toBe(true)
  })
})
