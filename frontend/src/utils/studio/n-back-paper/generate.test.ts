import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import {
  STUDIO_TEST_CTX,
  assertObjectsInSafeMargin,
  contentFingerprint,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_ANSWER_INK_MONO } from '@/constants/studio.constants'
import {
  calculateDimensionsWithBleed,
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import { nBackPaperTemplate } from './generate'
import { ALPHABETS } from './sequence'
import { N_BACK_SHAPES, isNBackIconSymbol } from './shapes'
import { hasPhosphorIcon } from '../studio-phosphor-icon'

function ctxForTrim(label: Parameters<typeof parsePageSizeLabel>[0]): StudioGenerateContext {
  const trim = parsePageSizeLabel(label)
  const page = calculateDimensionsWithBleed(trim, false)
  const margin = resolveStudioMarginForPage({
    pageIndex: 0,
    pageWidth: page.widthPixels,
    pageHeight: page.heightPixels,
    marginGuide: calculateMarginGuide(24, false),
  })
  return {
    pageWidth: page.widthPixels,
    pageHeight: page.heightPixels,
    margin,
    seed: 42,
    instanceId: 'test-run',
  }
}

runGeneratorContractTests(nBackPaperTemplate, {
  configOverrides: { mode: 'recall', n: 2, seqLength: 12, questionCount: 6 },
})

describe('n-back-paper dense judgement layout', () => {
  it('keeps max items inside the safe margin on 7.5×9.25', () => {
    const ctx = ctxForTrim('7.5 x 9.25 in')
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'judgement',
      n: 3,
      rowCount: 30,
      title: 'N-Back Paper',
      showInstructions: true,
    }
    resetObjectCounter()
    const pages = nBackPaperTemplate.generate(config, ctx)
    expect(pages).toHaveLength(1)
    assertObjectsInSafeMargin(pages[0].objects, ctx)

    const group = pages[0].objects.find((o) => o.type === 'group')
    expect(group).toBeDefined()
    const safeBottom = ctx.pageHeight - ctx.margin.bottom
    const groupBottom = (group!.top ?? 0) + (group!.height ?? 0)
    expect(groupBottom).toBeLessThanOrEqual(safeBottom)
  })

  it('keeps max items inside the safe margin on compact trims', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '7.5 x 9.25 in'] as const) {
      const ctx = ctxForTrim(label)
      const config = {
        ...buildDefaultConfig(nBackPaperTemplate),
        fontFamily: 'PT Serif',
        mode: 'judgement',
        n: 3,
        rowCount: 30,
        title: 'N-Back Paper',
        showInstructions: true,
      }
      resetObjectCounter()
      const pages = nBackPaperTemplate.generate(config, ctx)
      assertObjectsInSafeMargin(pages[0].objects, ctx)
    }
  })
})

describe('n-back-paper answer marks', () => {
  it('uses vector checkmarks, not ✓ text (export-safe)', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'judgement',
      n: 2,
      rowCount: 20,
    }
    resetObjectCounter()
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 42,
    })
    const answers = harvestAnswers(pages[0].objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(
      answers.every((o) => o.type === 'group' && o.data?.source === 'studio-check-mark'),
    ).toBe(true)
    expect(JSON.stringify(pages[0].objects)).not.toContain('✓')
  })
})

describe('n-back-paper alphabets', () => {
  it('uses full letter and digit ranges', () => {
    expect(ALPHABETS.letters).toHaveLength(26)
    expect(ALPHABETS.letters[0]).toBe('A')
    expect(ALPHABETS.letters[25]).toBe('Z')
    expect(ALPHABETS.digits).toEqual([
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ])
  })

  it('uses Phosphor duotone icons for shapes (Change Detection paint)', () => {
    expect(N_BACK_SHAPES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(N_BACK_SHAPES).size).toBe(N_BACK_SHAPES.length)
    expect(ALPHABETS.shapes).toBe(N_BACK_SHAPES)
    expect(N_BACK_SHAPES.every((name) => hasPhosphorIcon(name))).toBe(true)
    expect(isNBackIconSymbol('circle')).toBe(true)
    expect(isNBackIconSymbol('A')).toBe(false)
  })

  it('renders shape mode as phosphor icon groups, not unicode text', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'judgement',
      alphabet: 'shapes',
      n: 2,
      rowCount: 12,
    }
    resetObjectCounter()
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 7,
    })
    const json = JSON.stringify(pages[0].objects)
    expect(json).toContain('phosphor-icon')
    expect(json).toContain('#D6D6D6')
    expect(json).toContain('#4B4B4B')
  })

  it('keeps phosphor duotone colors on the recall answer key', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'recall',
      alphabet: 'shapes',
      n: 2,
      seqLength: 12,
      questionCount: 6,
    }
    resetObjectCounter()
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 11,
    })
    const key = buildAnswerPage(pages[0].objects, STUDIO_ANSWER_INK_MONO)
    const icons = key.filter((o) => o.data?.source === 'phosphor-icon')
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.every((o) => o.visible === true)).toBe(true)
    const keyJson = JSON.stringify(icons)
    expect(keyJson).toContain('#D6D6D6')
    expect(keyJson).toContain('#4B4B4B')
    // Must not collapse every path fill to solid black answer ink.
    const allFillsBlack = icons.every((icon) =>
      (icon.objects ?? []).every((c) => !c.fill || c.fill === '#000000' || c.fill === 'transparent'),
    )
    expect(allFillsBlack).toBe(false)
  })
})

describe('n-back-paper uniqueness', () => {
  it('seed batch yields distinct sheets (no duplicates)', () => {
    const bulkTotal = 50
    const seen = new Set<string>()
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'judgement',
      n: 2,
      rowCount: 20,
    }
    for (let i = 0; i < bulkTotal; i++) {
      const seed = 2_000 + i * 11_003
      resetObjectCounter()
      const pages = nBackPaperTemplate.generate(config, {
        ...STUDIO_TEST_CTX,
        seed,
      })
      seen.add(pages.map((page) => contentFingerprint(page.objects)).join('#'))
    }
    expect(seen.size).toBe(bulkTotal)
  })
})

describe('n-back-paper recall answers', () => {
  it('keeps hidden answer objects on the puzzle page', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'recall',
      n: 3,
      seqLength: 14,
      questionCount: 5,
    }
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 77,
    })
    expect(pages).toHaveLength(1)
    const answers = harvestAnswers(pages[0].objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((a) => a.studioRole === 'answer')).toBe(true)
    expect(answers.every((a) => a.visible === false)).toBe(true)
  })

  it('emits no trivial first-two-item targets in recall prompts', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'recall',
      n: 2,
      seqLength: 12,
      questionCount: 6,
    }
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 9,
    })
    const questionPrompts = pages[0].objects.filter(
      (o) => o.studioRole === 'prompt' && String(o.text ?? '').startsWith('What was'),
    )
    expect(questionPrompts.length).toBeGreaterThan(0)
    for (const p of questionPrompts) {
      const match = String(p.text).match(/position (\d+)\?$/)
      expect(match).not.toBeNull()
      const k = Number(match![1])
      expect(k - 2).toBeGreaterThanOrEqual(3)
    }
  })

  it('aligns recall answers on a shared blank column', () => {
    const config = {
      ...buildDefaultConfig(nBackPaperTemplate),
      fontFamily: 'PT Serif',
      mode: 'recall',
      n: 3,
      seqLength: 14,
      questionCount: 7,
    }
    const pages = nBackPaperTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      seed: 11,
    })
    const answers = harvestAnswers(pages[0].objects)
    expect(answers.length).toBeGreaterThan(1)
    const lefts = new Set(answers.map((a) => a.left))
    const widths = new Set(answers.map((a) => a.width))
    expect(lefts.size).toBe(1)
    expect(widths.size).toBe(1)
  })
})
