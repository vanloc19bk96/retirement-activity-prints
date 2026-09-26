import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { contentBox, drawHeader } from '../studio-layout'
import { wordLadderTemplate } from './generate'
import { WL_CONFIG_SCHEMA } from './config'
import {
  WL_DEFAULT_TITLE,
  WL_GENTLE_HINT,
  WL_INSTRUCTION,
  WL_LEVELS,
  WL_TEMPLATE_KEY,
  isValidWlLadder,
  parseWlBook,
  parseWlLevel,
  pickWlLadders,
  wlChangedSquares,
  wlClue,
  wlFinish,
  wlLadderById,
  wlLevelLadders,
  wlLevelSpec,
  wlRungs,
  wlStart,
  type WlLadder,
  type WlLevel,
} from './content'
import { WL_CLUES, WL_LADDERS_BY_LEVEL } from './ladders'
import { WL_PART_KEY, buildWlLadder } from './draw'
import { checkWlDrawnLadder, runWlKdpPreflight } from './kdp-preflight'
import {
  WL_CLUE_MIN,
  WL_LETTER_MIN,
  placeWlLadders,
  planWlPage,
  wlBodyField,
  wlContentBox,
  wlFieldInBody,
  wlPrintNote,
  wlWorstCasePlan,
  type WlPagePlan,
} from './layout'

const FONT = 'PT Serif'
const LEVELS = WL_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(wordLadderTemplate),
  showTitle: true,
  title: WL_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookLabels: string[] = [], ownerSalt?: string): StudioGenerateContext => ({
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
  remoteData: { bookLabels },
  ownerSalt,
})

const TRIMS: [number, number][] = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
]

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return wordLadderTemplate.generate(config, ctx)
}

function laddersOf(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.filter((o) => o.data?.[WL_PART_KEY] === 'ladder')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[WL_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

const tag: StudioTag = { templateKey: WL_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' }

function pageFor(ctx: StudioGenerateContext, level: WlLevel, config: StudioConfig = base) {
  const instruction = level === 'gentle' ? WL_INSTRUCTION + WL_GENTLE_HINT : WL_INSTRUCTION
  const header = drawHeader(wlContentBox(ctx), config, tag, instruction)
  const field = wlFieldInBody(header.body, header.objects.length > 0)
  const plan = wlWorstCasePlan({ page: ctx, config: { ...config, level }, level, font: FONT })!
  return { field, plan }
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(wordLadderTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: WL_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(wordLadderTemplate, { seeds: 12 })

describe('word-ladder registry and form', () => {
  it('is registered once, in the word tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === WL_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('word')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(WL_DEFAULT_TITLE)
    expect(found[0]!.label).toMatch(/work to play/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(WL_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(WL_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(wordLadderTemplate).level).toBe('classic')
    expect(parseWlLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseWlLevel(level)).toBe(level)
  })

  it('reports ladders a page and print sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = wlPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toContain(String(wlLevelLadders(level).length))
      expect(note).toMatch(/ladders? a page, squares [\d.]+ in, letters \d+ pt, clues \d+ pt\.$/)
      expect(wlPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
      expect(wlPrintNote({ config: base, level, font: FONT })).toMatch(/clue on every rung/)
    }
  })

  it('shades the changing letter, and says so, only at Gentle', () => {
    expect(wlLevelSpec('gentle').shadeChange).toBe(true)
    expect(wlLevelSpec('classic').shadeChange).toBe(false)
    expect(wlLevelSpec('challenging').shadeChange).toBe(false)
  })
})

describe('word-ladder library', () => {
  it('holds a real library at every level', () => {
    expect(wlLevelLadders('gentle').length).toBeGreaterThanOrEqual(30)
    expect(wlLevelLadders('classic').length).toBeGreaterThanOrEqual(30)
    expect(wlLevelLadders('challenging').length).toBeGreaterThanOrEqual(24)
    const ids = LEVELS.flatMap((level) => wlLevelLadders(level).map((l) => l.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(wlLadderById(id)?.id).toBe(id)
  })

  for (const level of ['gentle', 'classic', 'challenging'] as const) {
    it(`proves every ${level} ladder changes one letter a step, in four-letter everyday words, with a clue on every rung`, () => {
      for (const ladder of WL_LADDERS_BY_LEVEL[level]) {
        expect(isValidWlLadder(ladder, level), ladder.id).toBe(true)
        for (const word of ladder.words) expect(word, ladder.id).toMatch(/^[A-Z]{4}$/)
        for (let i = 1; i < ladder.words.length; i++) {
          expect(wlChangedSquares(ladder.words[i - 1]!, ladder.words[i]!), `${ladder.id} step ${i}`).toHaveLength(1)
        }
      }
    })
  }

  it('never lets two ladders of a level share both ends and every rung', () => {
    for (const level of LEVELS) {
      const words = wlLevelLadders(level).map((l) => l.words.join(' '))
      expect(new Set(words).size).toBe(words.length)
    }
  })

  it('clues every rung word once, briefly, never naming its own word, and keeps no clue it does not use', () => {
    const used = new Set(LEVELS.flatMap((level) => wlLevelLadders(level).flatMap((l) => wlRungs(l))))
    expect(new Set(Object.keys(WL_CLUES))).toEqual(used)
    for (const [word, clue] of Object.entries(WL_CLUES)) {
      expect(clue.length, word).toBeGreaterThan(3)
      expect(clue.length, word).toBeLessThanOrEqual(30)
      expect(clue.toUpperCase(), word).not.toContain(word)
      expect(clue, word).not.toMatch(/\s{2}|^\s|\s$/)
    }
  })

  it('climbs from a word of work to a word of retirement', () => {
    const work = new Set(['WORK', 'DESK', 'BOSS', 'TASK', 'FILE', 'MAIL', 'NOTE', 'LIST', 'FAST', 'RUSH', 'TEAM', 'BELL', 'COST', 'LATE', 'TIRE', 'SELL', 'HARD', 'FORM', 'PENS'])
    for (const level of LEVELS) {
      for (const ladder of wlLevelLadders(level)) {
        expect(work.has(wlStart(ladder)), ladder.id).toBe(true)
        expect(work.has(wlFinish(ladder)), ladder.id).toBe(false)
      }
    }
  })

  it('refuses a ladder that changes two letters, repeats a word, or has an unclued rung', () => {
    const good = wlLevelLadders('classic')[0]!
    expect(isValidWlLadder(good, 'classic')).toBe(true)
    expect(isValidWlLadder({ id: 'x', words: ['WORK', 'CORD', 'COLD', 'GOLD', 'GOLF'] }, 'classic')).toBe(false)
    expect(isValidWlLadder({ id: 'x', words: ['WORK', 'WORD', 'WORK', 'WORD', 'WORK'] }, 'classic')).toBe(false)
    expect(isValidWlLadder({ id: 'x', words: ['WORK', 'WORT', 'WART', 'CART', 'CARD'] }, 'classic')).toBe(false)
    // Right ladder, wrong level: too few rungs for Challenging.
    expect(isValidWlLadder(good, 'challenging')).toBe(false)
  })
})

describe('word-ladder dealing', () => {
  const deal = (level: WlLevel, book: string[], seed = 1, ownerSalt = saltOf(1), recent: string[] = []) =>
    pickWlLadders({ level, count: 2, seed, ownerSalt, book, recent })!

  it('walks the whole level before a ladder returns, and never repeats the page before', () => {
    for (const level of LEVELS) {
      const book: string[] = []
      const size = wlLevelLadders(level).length
      for (let page = 0; page < Math.floor(size / 2); page++) {
        const { ladders, repeat } = deal(level, book, 100 + page)
        expect(repeat).toBe(false)
        for (const l of ladders) expect(book).not.toContain(l.id)
        book.push(...ladders.map((l) => l.id))
      }
      const again = deal(level, book, 999)
      const previous = new Set(book.slice(-2))
      if (size % 2 === 0) {
        expect(again.repeat).toBe(true)
        for (const l of again.ladders) expect(previous.has(l.id)).toBe(false)
      }
    }
  })

  it('keeps a page’s start and finish words apart, and prints the shorter ladder first', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of LEVELS) {
        const { ladders } = pickWlLadders({ level, count: 3, seed, ownerSalt: saltOf(seed), book: [], recent: [] })!
        expect(new Set(ladders.map(wlStart)).size).toBe(3)
        expect(new Set(ladders.map(wlFinish)).size).toBe(3)
        for (let i = 1; i < ladders.length; i++) expect(ladders[i]!.words.length).toBeGreaterThanOrEqual(ladders[i - 1]!.words.length)
      }
    }
  })

  it('deals differently for different sellers on the same seed, and the same for the same seller', () => {
    const ids = (salt: string) => deal('classic', [], 7, salt).ladders.map((l) => l.id).join(',')
    expect(ids(saltOf(1))).toBe(ids(saltOf(1)))
    const distinct = new Set(Array.from({ length: 12 }, (_, i) => ids(saltOf(i + 1))))
    expect(distinct.size).toBeGreaterThan(6)
  })

  it('leaves what the seller printed lately for later', () => {
    const all = wlLevelLadders('classic').map((l) => l.id)
    const recent = all.slice(0, all.length - 4)
    for (let seed = 1; seed <= 20; seed++) {
      for (const l of deal('classic', [], seed, saltOf(3), recent).ladders) expect(recent).not.toContain(l.id)
    }
  })

  it('reads the book’s labels back, ignoring anything that is not a ladder', () => {
    const id = wlLevelLadders('gentle')[0]!.id
    expect(parseWlBook([id, 'nope', 'teacup|n', id])).toEqual([id, id])
  })
})

describe('word-ladder pages', () => {
  it('prints a proven, large-print page on every common trim at every level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        const ctx = kdpCtx(w, h)
        const config = { ...base, level }
        const pages = generate(config, ctx)
        expect(pages).toHaveLength(1)
        const ladders = laddersOf(pages[0]!.objects)
        expect(ladders.length, `${w}x${h} ${level}`).toBeGreaterThanOrEqual(1)
        const plan = wlWorstCasePlan({ page: ctx, config, level, font: FONT })!
        expect(ladders).toHaveLength(plan.count)
        expect(plan.metrics.letterSize).toBeGreaterThanOrEqual(WL_LETTER_MIN)
        expect(plan.metrics.clueSize).toBeGreaterThanOrEqual(WL_CLUE_MIN)
        expect(plan.metrics.cell).toBeGreaterThanOrEqual(Math.ceil(wlLevelSpec(level).minCell))
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        assertObjectsInSafeMargin(pages[0]!.answerSourceObjects!, ctx)
        for (const group of ladders) {
          const ladder = wlLadderById(String(group.data?.[STUDIO_CONTENT_LABEL_KEY]))!
          expect(checkWlDrawnLadder({ group, ladder, level, index: ladders.indexOf(group) })).toEqual([])
        }
      }
    }
  })

  it('fits two or more ladders on the popular trims, and gives a lone tall ladder bigger squares', () => {
    const planOf = (w: number, h: number, level: WlLevel) => wlWorstCasePlan({ page: kdpCtx(w, h), config: { ...base, level }, level, font: FONT })!
    for (const level of LEVELS) expect(planOf(8.5, 11, level).count, `8.5x11 ${level}`).toBeGreaterThanOrEqual(2)
    expect(planOf(8.5, 11, 'gentle').count).toBe(3)
    expect(planOf(6, 9, 'gentle').count).toBe(2)
    expect(planOf(6, 9, 'classic').count).toBe(2)
    // Eight words tall: one a page on 6 × 9, printed at the largest squares.
    const tall = planOf(6, 9, 'challenging')
    expect(tall.count).toBe(1)
    expect(tall.metrics.cell).toBeGreaterThan(planOf(8.5, 11, 'challenging').metrics.cell)
  })

  it('says plainly when a trim is too small', () => {
    const pages = generate(base, kdpCtx(3, 4))
    expect(laddersOf(pages[0]!.objects)).toHaveLength(0)
    expect(pages[0]!.objects.some((o) => /too small/.test(String(o.text)))).toBe(true)
  })

  it('prints the given words, hides every rung for the answer page, and shades only at Gentle', () => {
    for (const level of LEVELS) {
      const pages = generate({ ...base, level }, kdpCtx(8.5, 11))
      for (const group of laddersOf(pages[0]!.objects)) {
        const ladder = wlLadderById(String(group.data?.[STUDIO_CONTENT_LABEL_KEY]))!
        const given = partsOf(group, 'given').map((o) => o.text).join('')
        expect(given).toBe(wlStart(ladder) + wlFinish(ladder))
        const answers = partsOf(group, 'answer')
        expect(answers.map((o) => o.text).join('')).toBe(wlRungs(ladder).join(''))
        expect(answers.every((o) => o.visible === false && o.studioRole === 'answer')).toBe(true)
        expect(partsOf(group, 'shade')).toHaveLength(level === 'gentle' ? wlRungs(ladder).length : 0)
        expect(partsOf(group, 'clue').map((o) => String(o.text).replace(/\n/g, ' '))).toEqual(wlRungs(ladder).map(wlClue))
        expect(partsOf(group, 'rung')).toHaveLength(ladder.words.length - 1)
        expect(partsOf(group, 'rail')).toHaveLength(2)
        const caption = String(partsOf(group, 'caption')[0]!.text).replace(/\n/g, ' ')
        expect(caption).toBe(`${laddersOf(pages[0]!.objects).indexOf(group) + 1}. From ${wlStart(ladder)} to ${wlFinish(ladder)}`)
      }
    }
  })

  it('fills every rung in on the answer page, in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    expect(out.flatMap((p) => harvestAnswers(p.objects)).length).toBeGreaterThan(4)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const ladders = laddersOf(key)
    expect(ladders.length).toBeGreaterThan(0)
    for (const group of ladders) {
      const answers = partsOf(group, 'answer')
      expect(answers.every((o) => o.visible === true && o.fill === STUDIO_INK)).toBe(true)
    }
    expect(key.some((o) => o.text === WL_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === WL_INSTRUCTION)).toBe(true)
  })

  it('builds a book that walks the level before repeating, reading back its own pages', () => {
    const labels: string[] = []
    const size = wlLevelLadders('challenging').length
    for (let page = 0; page < 6; page++) {
      const out = generate({ ...base, level: 'challenging', seed: page + 1 }, kdpCtx(8.5, 11, page + 1, [...labels], saltOf(9)))
      for (const group of laddersOf(out[0]!.objects)) labels.push(String(group.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(labels.length).toBeLessThanOrEqual(size)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('stamps each ladder with its id, so the book can read it back', () => {
    const out = generate(base, kdpCtx(6, 9))
    for (const group of laddersOf(out[0]!.objects)) {
      const id = String(group.data?.[STUDIO_CONTENT_LABEL_KEY])
      expect(wlLadderById(id)).toBeDefined()
      expect(parseWlBook([id])).toEqual([id])
    }
  })
})

describe('word-ladder preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const setup = (level: WlLevel = 'classic') => {
    const { field, plan } = pageFor(ctx, level)
    const ladders = pickWlLadders({ level, count: plan.count, seed: 3, ownerSalt: saltOf(3), book: [], recent: [] })!.ladders
    const placements = placeWlLadders({ field, plan, ladders, font: FONT })
    return { field, plan, ladders, placements, level }
  }

  it('passes a proven page', () => {
    const { field, plan, placements, level } = setup()
    expect(runWlKdpPreflight({ placements, plan, level, field }).errors).toEqual([])
  })

  it('refuses a ladder with a broken step or a clue set differently', () => {
    const { field, plan, placements, level } = setup()
    const broken: WlLadder = { id: 'broken', words: ['WORK', 'CORD', 'COLD', 'GOLD', 'GOLF'] }
    const bad = [{ ...placements[0]!, ladder: broken }, ...placements.slice(1)]
    expect(runWlKdpPreflight({ placements: bad, plan, level, field }).ok).toBe(false)
    const reworded = [{ ...placements[0]!, clueLines: placements[0]!.clueLines.map(() => ['Something else']) }, ...placements.slice(1)]
    expect(runWlKdpPreflight({ placements: reworded, plan, level, field }).errors.join(' ')).toMatch(/set differently/)
  })

  it('refuses a ladder the book already prints while others are unused', () => {
    const { field, plan, placements, level } = setup()
    const book = [placements[0]!.ladder.id]
    expect(runWlKdpPreflight({ placements, plan, level, field, book }).errors.join(' ')).toMatch(/already has/)
  })

  it('refuses small print and a ladder off the page', () => {
    const { field, plan, placements, level } = setup()
    const small: WlPagePlan = { ...plan, metrics: { ...plan.metrics, cell: 20, letterSize: 12, clueSize: 12 } }
    const errors = runWlKdpPreflight({ placements, plan: small, level, field }).errors.join(' ')
    expect(errors).toMatch(/squares print below/)
    expect(errors).toMatch(/16 pt/)
    expect(errors).toMatch(/14 pt/)
    const off = [{ ...placements[0]!, block: { ...placements[0]!.block, left: field.left - 40 } }, ...placements.slice(1)]
    expect(runWlKdpPreflight({ placements: off, plan, level, field }).errors.join(' ')).toMatch(/printable area/)
  })

  it('catches a drawn ladder whose answers show, or whose shading is wrong', () => {
    const { plan, placements, level } = setup('gentle')
    const placement = placements[0]!
    const group = buildWlLadder({ placement, plan, level, tag, font: FONT })
    expect(checkWlDrawnLadder({ group, ladder: placement.ladder, level, index: 0 })).toEqual([])
    const shown = JSON.parse(JSON.stringify(group)) as StudioFabricObject
    for (const o of shown.objects ?? []) if (o.data?.[WL_PART_KEY] === 'answer') o.visible = true
    expect(checkWlDrawnLadder({ group: shown, ladder: placement.ladder, level, index: 0 }).join(' ')).toMatch(/shows on the puzzle page/)
    expect(checkWlDrawnLadder({ group, ladder: placement.ladder, level, index: 1 }).join(' ')).toMatch(/caption/)
    expect(checkWlDrawnLadder({ group, ladder: placement.ladder, level: 'classic', index: 0 }).join(' ')).toMatch(/shades no squares/)
  })

  it('plans no page at all when the field cannot hold one ladder at large print', () => {
    const tiny = { left: 0, top: 0, width: 200, height: 150 }
    for (const level of LEVELS) expect(planWlPage(tiny, 150, level, FONT)).toBeNull()
    const field = wlBodyField(ctx, base, WL_INSTRUCTION)
    expect(field.height).toBeGreaterThan(0)
    expect(contentBox(ctx).width).toBeGreaterThan(field.width)
  })
})
