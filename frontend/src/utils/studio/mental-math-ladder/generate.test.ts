import { describe, it, expect } from 'vitest'
import { mentalMathLadderTemplate } from './generate'
import { buildChain, type MathChain, type MathOperationSet } from './chain'
import { createRng } from '../studio-rng'
import { buildDefaultConfig } from '@/constants/studio-templates'
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
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) {
      out.push(...flattenObjects(o.objects))
    }
  }
  return out
}

function puzzleGroup(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.type === 'group' && o.studioRole === 'structure')
}

/** Real KDP 5×8 with bleed — tightest common trim that still hosts 12 ladders. */
function kdpCtx(pageIndex = 0): StudioGenerateContext {
  const trim = parsePageSizeLabel('5 x 8 in')
  const marginGuide = calculateMarginGuide(100, true)
  return {
    pageWidth: trim.widthPixels,
    pageHeight: trim.heightPixels,
    margin: resolveStudioMarginForPage({
      pageIndex,
      pageWidth: trim.widthPixels,
      pageHeight: trim.heightPixels,
      marginGuide,
    }),
    seed: 42,
    instanceId: 'test-run',
  }
}

const base: StudioConfig = {
  ...buildDefaultConfig(mentalMathLadderTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

const MINUS = '\u2212'
const TIMES = '\u00d7'
const DIVIDE = '\u00f7'

function applyLabel(label: string, current: number): number {
  const [operator, operand] = label.split(' ')
  if (label === 'half of it') return current / 2
  if (label === 'double it') return current * 2
  if (label.endsWith('% of it')) return (current * parseInt(label, 10)) / 100
  const value = Number(operand)
  if (operator === '+') return current + value
  if (operator === MINUS) return current - value
  if (operator === TIMES) return current * value
  if (operator === DIVIDE) return current / value
  throw new Error(`unknown rung label: ${label}`)
}

function replay(chain: MathChain): number {
  return chain.steps.reduce((total, step) => applyLabel(step.label, total), chain.start)
}

runGeneratorContractTests(mentalMathLadderTemplate)
assertGeneratorEntropy(mentalMathLadderTemplate)

describe('mental-math-ladder chain', () => {
  const difficulties = ['easy', 'medium', 'hard'] as const
  const operationSets: MathOperationSet[] = ['add-sub', 'add-sub-mul', 'all']
  const BANDS = {
    easy: { min: 2, max: 60 },
    medium: { min: 61, max: 250 },
    hard: { min: 251, max: 999 },
  } as const

  it('keeps every running total a whole number above zero', () => {
    for (const difficulty of difficulties) {
      for (const operationSet of operationSets) {
        for (let seed = 1; seed <= 120; seed++) {
          const chain = buildChain({
            steps: 6,
            difficulty,
            operationSet,
            rng: createRng(seed),
          })
          expect(Number.isInteger(chain.start)).toBe(true)
          for (const step of chain.steps) {
            expect(Number.isInteger(step.value)).toBe(true)
            expect(step.value).toBeGreaterThanOrEqual(2)
          }
        }
      }
    }
  })

  it('labels replay to the stated answer', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const chain = buildChain({
        steps: 5,
        difficulty: 'hard',
        operationSet: 'all',
        rng: createRng(seed),
      })
      expect(replay(chain)).toBe(chain.answer)
      expect(chain.steps.at(-1)!.value).toBe(chain.answer)
    }
  })

  it('respects the selected operation set', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const chain = buildChain({
        steps: 6,
        difficulty: 'medium',
        operationSet: 'add-sub',
        rng: createRng(seed),
      })
      for (const step of chain.steps) {
        expect(step.label.startsWith('+ ') || step.label.startsWith(`${MINUS} `)).toBe(true)
      }
    }
  })

  it('never revisits a total, so no rung undoes the previous one', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const chain = buildChain({
        steps: 5,
        difficulty: 'medium',
        operationSet: 'all',
        rng: createRng(seed),
      })
      const totals = [chain.start, ...chain.steps.map((step) => step.value)]
      expect(new Set(totals).size).toBe(totals.length)
    }
  })

  it('keeps final answers in the difficulty band', () => {
    for (const difficulty of difficulties) {
      const band = BANDS[difficulty]
      for (const operationSet of operationSets) {
        for (const stepCount of [2, 4, 6] as const) {
          for (let seed = 1; seed <= 80; seed++) {
            const chain = buildChain({
              steps: stepCount,
              difficulty,
              operationSet,
              rng: createRng(seed),
            })
            expect(chain.answer).toBeGreaterThanOrEqual(band.min)
            expect(chain.answer).toBeLessThanOrEqual(band.max)
            for (const step of chain.steps) {
              expect(step.value).toBeLessThanOrEqual(band.max)
            }
          }
        }
      }
    }
  })

  /**
   * The regression this guards: a forward random walk that could not climb into
   * its band had its last rung rewritten to the band floor, so every "hard,
   * add and subtract only" ladder answered 251. Clustering like that is obvious
   * on the page and unsellable, so spread is asserted per setting, not overall.
   */
  it('spreads answers across the band for every setting', () => {
    const SAMPLES = 200
    for (const difficulty of difficulties) {
      const band = BANDS[difficulty]
      const bandSpan = band.max - band.min
      for (const operationSet of operationSets) {
        for (const stepCount of [2, 4, 6] as const) {
          const label = `${difficulty}/${operationSet}/${stepCount}`
          const rng = createRng(9_001)
          const counts = new Map<number, number>()
          let min = Infinity
          let max = -Infinity
          for (let i = 0; i < SAMPLES; i++) {
            const { answer } = buildChain({
              steps: stepCount,
              difficulty,
              operationSet,
              rng,
            })
            counts.set(answer, (counts.get(answer) ?? 0) + 1)
            min = Math.min(min, answer)
            max = Math.max(max, answer)
          }

          // Distinct answers, against whichever ceiling binds — the sample size
          // or the band itself (easy holds only 59 possible answers).
          const reachable = Math.min(SAMPLES, bandSpan + 1)
          expect(counts.size, label).toBeGreaterThan(reachable * 0.5)

          // Answers reach across the band, not just a sliver of it.
          expect(max - min, label).toBeGreaterThan(bandSpan * 0.5)

          // No single answer dominates — the old bug piled everything on one.
          expect(Math.max(...counts.values()), label).toBeLessThan(SAMPLES * 0.1)
        }
      }
    }
  })

  it('gives every ladder on a full page its own answer', () => {
    for (const difficulty of difficulties) {
      for (const operationSet of operationSets) {
        for (let seed = 1; seed <= 25; seed++) {
          const rng = createRng(seed)
          const usedAnswers = new Set<number>()
          const usedStarts = new Set<number>()
          for (let i = 0; i < 12; i++) {
            const chain = buildChain({
              steps: 6,
              difficulty,
              operationSet,
              rng,
              usedAnswers,
              usedStarts,
            })
            usedAnswers.add(chain.answer)
            usedStarts.add(chain.start)
          }
          expect(usedAnswers.size, `${difficulty}/${operationSet}/seed ${seed}`).toBe(12)
        }
      }
    }
  })

  it('replays to the stated answer for every setting', () => {
    for (const difficulty of difficulties) {
      for (const operationSet of operationSets) {
        for (const stepCount of [2, 4, 6] as const) {
          for (let seed = 1; seed <= 40; seed++) {
            const chain = buildChain({
              steps: stepCount,
              difficulty,
              operationSet,
              rng: createRng(seed),
            })
            expect(chain.steps.length).toBe(stepCount)
            expect(replay(chain)).toBe(chain.answer)
          }
        }
      }
    }
  })

  it('never prints the same rung twice in a row', () => {
    for (const difficulty of difficulties) {
      for (const operationSet of operationSets) {
        for (let seed = 1; seed <= 60; seed++) {
          const chain = buildChain({
            steps: 6,
            difficulty,
            operationSet,
            rng: createRng(seed),
          })
          for (let i = 1; i < chain.steps.length; i++) {
            expect(chain.steps[i]!.label).not.toBe(chain.steps[i - 1]!.label)
          }
        }
      }
    }
  })
})

describe('mental-math-ladder', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('mental-math-ladder')).toBe(true)
  })

  it('hides one answer per ladder by default', () => {
    resetObjectCounter()
    const [page] = mentalMathLadderTemplate.generate(base, STUDIO_TEST_CTX)
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(Number(base.itemCount))
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('adds a hidden running total for every step when step boxes are on', () => {
    resetObjectCounter()
    // steps = visible lines including start → 4 lines = start + 3 operations.
    const config = { ...base, showRunningBoxes: true, itemCount: 4, steps: 4 }
    const [page] = mentalMathLadderTemplate.generate(config, STUDIO_TEST_CTX)
    // 3 running totals + 1 final answer per ladder.
    expect(harvestAnswers(page!.objects).length).toBe(4 * 4)
  })

  it('prints answers in black on the key', () => {
    resetObjectCounter()
    const [page] = mentalMathLadderTemplate.generate(base, STUDIO_TEST_CTX)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible !== false)).toBe(true)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('groups each ladder, then wraps them in one parent group', () => {
    resetObjectCounter()
    const [page] = mentalMathLadderTemplate.generate(
      { ...base, itemCount: 6 },
      STUDIO_TEST_CTX,
    )
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const ladders = (parent!.objects ?? []).filter((o) => o.type === 'group')
    expect(ladders.length).toBe(6)
    for (const ladder of ladders) {
      const kids = ladder.objects ?? []
      expect(kids.some((c) => c.studioRole === 'prompt')).toBe(true)
      expect(kids.some((c) => c.studioRole === 'answer')).toBe(true)
    }
  })

  it('keeps the densest configuration inside the safe margin', () => {
    resetObjectCounter()
    const ctx = kdpCtx()
    const pages = mentalMathLadderTemplate.generate(
      {
        ...base,
        itemCount: 12,
        // Max lines (start + 6 ops) with running totals.
        steps: 7,
        difficulty: 'hard',
        operations: 'all',
        showRunningBoxes: true,
        showTitle: true,
        title: 'Game 12',
      },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
      assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects, ctx)
    }
  })

  it('keeps the parent group clear of the safe-area bottom', () => {
    resetObjectCounter()
    const ctx = kdpCtx()
    const [page] = mentalMathLadderTemplate.generate(
      {
        ...base,
        itemCount: 12,
        steps: 4,
        showTitle: true,
        title: 'Game 12',
      },
      ctx,
    )
    const maxBottom = ctx.pageHeight - ctx.margin.bottom
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const bottom = (parent!.top ?? 0) + (parent!.height ?? 0) + STUDIO_STROKE_HAIRLINE / 2
    expect(bottom).toBeLessThanOrEqual(maxBottom)
  })

  it('prints one prompt line per Steps setting (start + operations)', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 2, steps: 6, showRunningBoxes: false }
    const [page] = mentalMathLadderTemplate.generate(config, STUDIO_TEST_CTX)
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const ladders = (parent!.objects ?? []).filter((o) => o.type === 'group')
    for (const ladder of ladders) {
      const prompts = (ladder.objects ?? []).filter((o) => o.studioRole === 'prompt')
      expect(prompts.length).toBe(6)
    }
  })

  it('right-aligns digits and centers that band over the write-in lines', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 2, steps: 3, showRunningBoxes: false }
    const [page] = mentalMathLadderTemplate.generate(config, STUDIO_TEST_CTX)
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const ladders = (parent!.objects ?? []).filter((o) => o.type === 'group')
    for (const ladder of ladders) {
      const kids = ladder.objects ?? []
      const prompts = kids.filter((o) => o.studioRole === 'prompt')
      const answers = kids.filter((o) => o.studioRole === 'answer')
      const structureLines = kids.filter(
        (o) => o.type === 'line' && o.studioRole === 'structure',
      )
      const writingLine = structureLines.find(
        (o) => (o.strokeDashArray?.length ?? 0) > 0,
      )
      const separator = structureLines.find(
        (o) => (o.strokeDashArray?.length ?? 0) === 0,
      )
      const answerBox = kids.find(
        (o) =>
          o.type === 'rect' &&
          o.studioRole === 'structure' &&
          o.fill === 'transparent',
      )
      expect(prompts.length).toBe(3)
      expect(answers.length).toBe(1)
      expect(writingLine).toBeDefined()
      expect(separator).toBeDefined()
      expect(answerBox).toBeUndefined()
      const rightEdge = prompts[0]!.left ?? 0
      expect(prompts.every((o) => o.originX === 'right')).toBe(true)
      expect(prompts.every((o) => o.textAlign === 'right')).toBe(true)
      expect(prompts.every((o) => o.fontFamily === STUDIO_DIGIT_FONT)).toBe(true)
      expect(prompts.every((o) => Math.abs((o.left ?? 0) - rightEdge) < 1)).toBe(true)
      const maxPromptW = Math.max(...prompts.map((o) => o.width ?? 0))
      const contentCenter = rightEdge - maxPromptW / 2
      const lineCenter = ((writingLine!.x1 ?? 0) + (writingLine!.x2 ?? 0)) / 2
      expect(Math.abs(contentCenter - lineCenter)).toBeLessThan(1)
      expect(answers[0]!.originX).toBe('center')
      expect(Math.abs((answers[0]!.left ?? 0) - lineCenter)).toBeLessThan(1)
      expect(answers[0]!.fontSize).toBe(prompts[0]!.fontSize)
      expect(answers[0]!.fontFamily).toBe(STUDIO_DIGIT_FONT)
      const writingW = Math.abs((writingLine!.x2 ?? 0) - (writingLine!.x1 ?? 0))
      expect(writingW).toBeGreaterThanOrEqual(maxPromptW - 1)
      // Separator sits between the last prompt and the answer write-in.
      const lastPromptBottom =
        (prompts[prompts.length - 1]!.top ?? 0) +
        (prompts[prompts.length - 1]!.fontSize ?? 0) / 2
      expect(separator!.y1 ?? 0).toBeGreaterThan(lastPromptBottom)
      expect(separator!.y1 ?? 0).toBeLessThan(writingLine!.y1 ?? 0)
    }
  })

  it('centers the ladder block in the body', () => {
    resetObjectCounter()
    // steps = visible lines → 4 lines = start + 3 operations.
    const config = { ...base, itemCount: 6, steps: 4 }
    const [page] = mentalMathLadderTemplate.generate(config, STUDIO_TEST_CTX)
    const prompts = flattenObjects(page!.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(6 * 4)
    // Start + steps share one right edge under each ladder (units stack).
    expect(prompts.every((o) => o.originX === 'right')).toBe(true)
    expect(prompts.every((o) => o.fontFamily === STUDIO_DIGIT_FONT)).toBe(true)
    expect(prompts.every((o) => o.fontWeight == null || o.fontWeight === 'normal')).toBe(true)

    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const content = insetHorizontal(contentBox(STUDIO_TEST_CTX), STUDIO_CONTENT_SAFE_INSET_X)
    // Mirror generate()'s instruction so body height matches the drawn field.
    const instruction =
      'Start at the top number of each ladder and work down, doing all 3 ' +
      'steps in your head. Write only the final answer on the line at the bottom. No rough work'
    const header = drawHeader(
      content,
      config,
      { templateKey: 'mental-math-ladder', instanceId: 'test-run', pageRole: 'single' },
      instruction,
    )
    const bodyCenterX = header.body.left + header.body.width / 2
    const bodyCenterY = header.body.top + header.body.height / 2
    const groupCenterX = (parent!.left ?? 0) + (parent!.width ?? 0) / 2
    const groupCenterY = (parent!.top ?? 0) + (parent!.height ?? 0) / 2
    expect(Math.abs(groupCenterX - bodyCenterX)).toBeLessThan(8)
    expect(Math.abs(groupCenterY - bodyCenterY)).toBeLessThan(30)
  })

  it('keeps same-column ladders on one write-in center axis', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 6, steps: 4, operations: 'all' }
    const [page] = mentalMathLadderTemplate.generate(config, STUDIO_TEST_CTX)
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const ladders = (parent!.objects ?? []).filter((o) => o.type === 'group')
    expect(ladders.length).toBe(6)

    // Groups store children relative to the group center — recover absolute X.
    const writingCenterAbs = (ladder: StudioFabricObject) => {
      const writingLine = (ladder.objects ?? []).find(
        (o) =>
          o.type === 'line' &&
          o.studioRole === 'structure' &&
          (o.strokeDashArray?.length ?? 0) > 0,
      )
      expect(writingLine).toBeDefined()
      const parentCenterX = (parent!.left ?? 0) + (parent!.width ?? 0) / 2
      const ladderAbsLeft = parentCenterX + (ladder.left ?? 0)
      const ladderCenterX = ladderAbsLeft + (ladder.width ?? 0) / 2
      const localCenter = ((writingLine!.x1 ?? 0) + (writingLine!.x2 ?? 0)) / 2
      return ladderCenterX + localCenter
    }

    // Column 0 = items 1, 3, 5 (indices 0, 2, 4).
    const col0 = [ladders[0]!, ladders[2]!, ladders[4]!].map(writingCenterAbs)
    const col1 = [ladders[1]!, ladders[3]!, ladders[5]!].map(writingCenterAbs)
    for (const edge of col0) {
      expect(Math.abs(edge - col0[0]!)).toBeLessThan(1)
    }
    for (const edge of col1) {
      expect(Math.abs(edge - col1[0]!)).toBeLessThan(1)
    }
  })

  it('centers the grouped solution block in the key body', () => {
    resetObjectCounter()
    const [page] = mentalMathLadderTemplate.generate(
      { ...base, itemCount: 3, steps: 2, showTitle: true, title: 'Game 1' },
      STUDIO_TEST_CTX,
    )
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const parent = puzzleGroup(keyObjects)
    expect(parent).toBeDefined()
    const ladders = (parent!.objects ?? []).filter((o) => o.type === 'group')
    expect(ladders.length).toBe(3)

    const content = insetHorizontal(contentBox(STUDIO_TEST_CTX), STUDIO_CONTENT_SAFE_INSET_X)
    // Solution layout omits instruction — match that taller body.
    const header = drawHeader(
      content,
      { ...base, itemCount: 3, steps: 2, showTitle: true, title: 'Game 1' },
      { templateKey: 'mental-math-ladder', instanceId: 'test-run', pageRole: 'single' },
      '',
    )
    const bodyCenterY = header.body.top + header.body.height / 2
    const groupCenterY = (parent!.top ?? 0) + (parent!.height ?? 0) / 2
    expect(Math.abs(groupCenterY - bodyCenterY)).toBeLessThan(30)
  })
})
