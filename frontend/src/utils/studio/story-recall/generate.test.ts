import { describe, it, expect } from 'vitest'
import { storyRecallTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { assertObjectsInSafeMargin, STUDIO_TEST_CTX } from '../studio-generator-test'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import type { StoryRecallResponse, StoryQuestion } from '@/types/studio-story.types'
import { resolveStoryFallback } from './fallback'

const STUDY_INSTRUCTION = 'Read the story twice. Then turn the page. Do not look back'

const REMOTE: StoryRecallResponse = {
  title: 'The Lost Umbrella',
  passage: 'On Tuesday, Mara left her blue umbrella on the number 12 bus.',
  questions: [
    { id: 'q1', wh: 'when', question: 'What day?', answer: 'Tuesday' },
    { id: 'q2', wh: 'what', question: 'What color?', answer: 'Blue' },
    { id: 'q3', wh: 'where', question: 'Where left?', answer: 'On the bus' },
  ],
}

function eightQuestions(): StoryQuestion[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `q${i + 1}`,
    wh: 'what' as const,
    question: `Question ${i + 1} about the story details?`,
    answer: `Answer ${i + 1}`,
  }))
}

const CTX = (remote: StoryRecallResponse = REMOTE): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const config = {
  ...buildDefaultConfig(storyRecallTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

describe('story-recall layout', () => {
  it('produces exactly two pages: study then recall', () => {
    resetObjectCounter()
    const pages = storyRecallTemplate.generate(config, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('renders the passage on the study page', () => {
    resetObjectCounter()
    const [study] = storyRecallTemplate.generate(config, CTX())
    expect(study.objects.some((o) => String(o.text).includes('umbrella'))).toBe(true)
  })

  it('uses open KDP-style leading on the study passage', () => {
    resetObjectCounter()
    const [study] = storyRecallTemplate.generate(config, CTX())
    const passage = study.objects.find((o) => String(o.text).includes('umbrella'))
    expect(passage?.lineHeight).toBe(1.5)
  })

  it('keeps study passage and recall Q&A at the same font size', () => {
    resetObjectCounter()
    const shortConfig = { ...config, length: 'short', title: REMOTE.title }
    const [study, recall] = storyRecallTemplate.generate(shortConfig, CTX())
    const passage = study.objects.find((o) => o.studioRole === 'prompt')
    const question = recall.objects.find((o) => o.studioRole === 'prompt')
    const answer = recall.objects.find((o) => o.studioRole === 'answer')
    expect(passage?.fontSize).toBeDefined()
    expect(question?.fontSize).toBe(passage!.fontSize)
    expect(answer?.fontSize).toBe(passage!.fontSize)
  })

  it('does not pre-shrink long length when the passage still fits', () => {
    resetObjectCounter()
    const mediumPages = storyRecallTemplate.generate(
      { ...config, length: 'medium', title: REMOTE.title },
      CTX(),
    )
    const longPages = storyRecallTemplate.generate(
      { ...config, length: 'long', title: REMOTE.title },
      CTX(),
    )
    const mediumSize = mediumPages[0].objects.find((o) => String(o.text).includes('umbrella'))
      ?.fontSize
    const longSize = longPages[0].objects.find((o) => String(o.text).includes('umbrella'))
      ?.fontSize
    expect(mediumSize).toBeDefined()
    expect(longSize).toBe(mediumSize)
  })

  it('centers a short study passage in the body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const shortConfig = { ...config, length: 'short', title: REMOTE.title }
    const [study] = storyRecallTemplate.generate(shortConfig, ctx)
    const passage = study.objects.find((o) => String(o.text).includes('umbrella'))
    expect(passage).toBeDefined()

    const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
    const { body } = drawHeader(
      content,
      shortConfig,
      { templateKey: 'story-recall', instanceId: ctx.instanceId, pageRole: 'study' },
      STUDY_INSTRUCTION,
    )

    // Short passage must sit well below the header, near the vertical middle of the body.
    expect(passage!.top).toBeGreaterThan(body.top + body.height * 0.2)
    expect(passage!.top).toBeLessThan(body.top + body.height * 0.55)
  })

  it('hides one answer per question on the recall page', () => {
    resetObjectCounter()
    const [, recall] = storyRecallTemplate.generate(config, CTX())
    const answers = recall.objects.filter((o) => o.studioRole === 'answer')
    expect(answers.length).toBe(REMOTE.questions.length)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('keeps eight questions inside the safe margin on a compact page', () => {
    resetObjectCounter()
    const remote = { ...REMOTE, questions: eightQuestions() }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const pages = storyRecallTemplate.generate(config, ctx)
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
    const [, recall] = pages
    const maxBottom = ctx.pageHeight - ctx.margin.bottom + 1
    for (const o of recall.objects) {
      if (o.type === 'line') {
        expect(o.y1 ?? o.top).toBeLessThanOrEqual(maxBottom)
        expect(o.y2 ?? o.top).toBeLessThanOrEqual(maxBottom)
      } else {
        expect(o.top).toBeLessThanOrEqual(maxBottom)
      }
    }
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    const ctx = { ...CTX(), remoteData: undefined }
    const pages = storyRecallTemplate.generate(config, ctx)
    expect(pages.length).toBeGreaterThanOrEqual(1)
  })
})

describe('story-recall fallback', () => {
  it('returns the requested question count up to 8', () => {
    const data = resolveStoryFallback('everyday life', 8, 1)
    expect(data.questions).toHaveLength(8)
  })
})
