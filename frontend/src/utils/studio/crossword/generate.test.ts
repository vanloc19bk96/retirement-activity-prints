import { describe, it, expect } from 'vitest'
import { crosswordTemplate } from './generate'
import {
  clueContainsAnswerFamily,
  isValidClueText,
  normalizeAnswerDisplay,
  themeIpWarning,
} from './content-quality'
import { selectCrosswordCandidates, sharedLetterCount } from './candidate-selector'
import { listCrosswordThemeMeta, loadThemeEntries } from './words'
import { packingBudget, parseAnswerCount, parseRetirementDifficulty } from './config'
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
import type { CrosswordPair } from './types'

/** Interlocking retirement-ish pool for offline generate tests. */
const AI_PAIRS: CrosswordPair[] = [
  { word: 'GARDEN', clue: 'A place to grow flowers and vegetables' },
  { word: 'TRAVEL', clue: 'Going on trips away from home' },
  { word: 'HOBBY', clue: 'A pastime done for enjoyment' },
  { word: 'RELAX', clue: 'Take it easy after a busy week' },
  { word: 'CRUISE', clue: 'A vacation taken by ship' },
  { word: 'PASSPORT', clue: 'Document needed for international travel' },
  { word: 'RETIRE', clue: 'Leave work for a new chapter' },
  { word: 'LEISURE', clue: 'Free time for rest or hobbies' },
  { word: 'NATURE', clue: 'The outdoors and living world' },
  { word: 'FRIEND', clue: 'Someone you enjoy spending time with' },
  { word: 'FAMILY', clue: 'Relatives you share life with' },
  { word: 'SUNSET', clue: 'Evening colors in the western sky' },
  { word: 'READING', clue: 'Enjoying a book in a quiet chair' },
  { word: 'WALKING', clue: 'A gentle outdoor exercise' },
  { word: 'CRAFTS', clue: 'Handmade creative projects' },
  { word: 'MUSIC', clue: 'Songs and melodies to enjoy' },
  { word: 'KITCHEN', clue: 'Room where meals are prepared' },
  { word: 'WEEKEND', clue: 'Days often free from the workweek' },
  { word: 'MEMORY', clue: 'Something remembered from the past' },
  { word: 'JOURNEY', clue: 'A trip from one place to another' },
  { word: 'PICNIC', clue: 'An outdoor meal on a blanket' },
  { word: 'CAMERA', clue: 'Device used to take photographs' },
  { word: 'BRIDGE', clue: 'Structure built to cross water' },
  { word: 'MARKET', clue: 'Place where people buy goods' },
]

const CTX = (remoteData: CrosswordPair[] = AI_PAIRS): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData,
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
  return (
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  )
}

runGeneratorContractTests(crosswordTemplate, {
  contextOverrides: { remoteData: AI_PAIRS },
})

describe('retirement crossword', () => {
  it('defaults to retirement category, classic, and large-print', () => {
    const defaults = buildDefaultConfig(crosswordTemplate)
    expect(defaults.writeOwnTheme).toBe(false)
    expect(defaults.retirementCategory).toBe('retirement-life')
    expect(defaults.presetThemeId).toBe('life-after-work')
    expect(defaults.difficulty).toBe('classic')
    expect(defaults.printStyle).toBe('large-print')
    expect(defaults.answerCount).toBe('auto')
  })

  it('drops Memory source / custom word-list fields', () => {
    const keys = crosswordTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('source')
    expect(keys).not.toContain('words')
    expect(keys).not.toContain('theme')
    expect(keys).not.toContain('wordCount')
    expect(keys).toContain('retirementCategory')
    expect(keys).toContain('presetThemeId')
    expect(keys).toContain('answerCount')
  })

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

  it('every retirement difficulty generates with AI remoteData', () => {
    for (const difficulty of ['relaxed', 'classic', 'challenge'] as const) {
      resetObjectCounter()
      const [page] = crosswordTemplate.generate({ ...base, difficulty }, CTX())
      expect(JSON.stringify(page)).not.toMatch(/Unable to generate crossword|couldn't create/i)
    }
  })

  it('uses AI words+clues from remoteData', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
    const json = JSON.stringify(page)
    expect(json).toMatch(/ACROSS/)
    expect(json).toMatch(/DOWN/)
    expect(json).toMatch(/\d+\.\s/)
    expect(json).not.toMatch(/Unable to generate crossword/i)
  })

  it('shows a visible error when remoteData is missing (no bundled fallback)', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, {
      pageWidth: 2550,
      pageHeight: 3300,
      margin: { top: 150, right: 150, bottom: 150, left: 225 },
      seed: 42,
      instanceId: 'test-run',
    })
    expect(JSON.stringify(page)).toMatch(/couldn't create enough high-quality crossword/i)
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
    const config = { ...base, title: 'Travel Dreams' }
    const [page] = crosswordTemplate.generate(config, ctx)
    const puzzleGrid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const solutionGrid = page!.answerSourceObjects!.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    expect(solutionGrid.width!).toBeGreaterThanOrEqual(puzzleGrid.width!)
    expect(solutionGrid.height!).toBeGreaterThanOrEqual(puzzleGrid.height!)

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
  })

  it('grid bars use mid-gray hairlines', () => {
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
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(base, CTX())
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
  })

  it('large-print clues stay at least 12 pt', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate(
      { ...base, printStyle: 'large-print', answerCount: 8 },
      CTX(),
    )
    const clues = flatten(page!.objects).filter(
      (o) =>
        o.studioRole === 'prompt' &&
        o.type === 'textbox' &&
        /^\d+\.\s/.test(String(o.text ?? '')),
    )
    expect(clues.length).toBeGreaterThan(0)
    expect(clues.every((c) => Number(c.fontSize ?? 0) >= 12)).toBe(true)
  })

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

  it('auto answer count follows classic large-print (10)', () => {
    expect(parseAnswerCount('auto', 'classic', 'large-print')).toBe(10)
    expect(parseRetirementDifficulty('medium')).toBe('classic')
  })

  it('places near the requested answer count from the AI pool', () => {
    resetObjectCounter()
    const [page] = crosswordTemplate.generate({ ...base, answerCount: 8 }, CTX())
    const clueLines = flatten(page!.objects)
      .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .filter((t) => /^\d+\.\s/.test(t))
    expect(clueLines.length).toBeGreaterThanOrEqual(7)
    expect(clueLines.length).toBeLessThanOrEqual(8)
  })

  it('validateConfig requires custom theme text when write-own is on', () => {
    expect(
      crosswordTemplate.validateConfig?.({
        ...base,
        writeOwnTheme: true,
        customTheme: '   ',
      }),
    ).toMatchObject({ field: 'customTheme' })
  })

  it('warns on IP-risky custom themes', () => {
    expect(themeIpWarning('Disney Retirement')).toMatch(/intellectual property/i)
    expect(themeIpWarning('Retirement Gardening')).toBeNull()
  })

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
    expect(isValidClueText('A place to grow flowers', 'GARDEN', 55)).toBe(true)
    expect(isValidClueText('A garden space', 'GARDEN', 55)).toBe(false)
  })

  it('ranks candidates by shared-letter crossability', () => {
    expect(sharedLetterCount('GARDEN', 'ADVENTURE')).toBeGreaterThan(0)
    const selected = selectCrosswordCandidates(AI_PAIRS, 10)
    expect(selected.length).toBeGreaterThanOrEqual(10)
    expect(selected.every((p) => p.clue.length > 0)).toBe(true)
  })

  it('keeps bundled theme pools for word-fit offline fallback', () => {
    const meta = listCrosswordThemeMeta()
    expect(meta).toHaveLength(10)
    expect(loadThemeEntries('animals').length).toBeGreaterThanOrEqual(500)
    expect(packingBudget()).toBeGreaterThanOrEqual(20)
  })
})
