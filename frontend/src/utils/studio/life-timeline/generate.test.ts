import { describe, it, expect } from 'vitest'
import { lifeTimelineTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { LifeTimelineRemoteData } from '@/types/studio-life-timeline.types'
import { SAFETY_LINE, STAGE_INSTRUCTION } from './draw'
import { WRITING_LINE_GAP_MIN } from './copy'

interface FlatObject extends StudioFabricObject {
  absLeft: number
  absTop: number
  absY1?: number
}

/** Flatten nested Fabric groups to absolute page coordinates. */
function flattenObjects(
  objects: StudioFabricObject[],
  originX = 0,
  originY = 0,
  isGroupChild = false,
): FlatObject[] {
  const out: FlatObject[] = []
  for (const object of objects) {
    if (object.type === 'group' && Array.isArray(object.objects)) {
      const absLeft = isGroupChild ? originX + (object.left ?? 0) : (object.left ?? 0)
      const absTop = isGroupChild ? originY + (object.top ?? 0) : (object.top ?? 0)
      const centerX = absLeft + (object.width ?? 0) / 2
      const centerY = absTop + (object.height ?? 0) / 2
      out.push(
        ...flattenObjects(
          object.objects as StudioFabricObject[],
          centerX,
          centerY,
          true,
        ),
      )
      continue
    }
    const absLeft = isGroupChild ? originX + (object.left ?? 0) : (object.left ?? 0)
    const absTop = isGroupChild ? originY + (object.top ?? 0) : (object.top ?? 0)
    out.push({
      ...object,
      absLeft,
      absTop,
      absY1:
        typeof object.y1 === 'number'
          ? isGroupChild
            ? originY + object.y1
            : object.y1
          : undefined,
    })
  }
  return out
}

function questionPrompts(objects: StudioFabricObject[]): FlatObject[] {
  return flattenObjects(objects).filter(
    (o) => o.studioRole === 'prompt' && String(o.text ?? '').endsWith('?'),
  )
}

function writingLines(objects: StudioFabricObject[]): FlatObject[] {
  return flattenObjects(objects).filter(
    (o) => o.type === 'line' && o.studioRole === 'structure',
  )
}

function promptTexts(objects: StudioFabricObject[]): string[] {
  return flattenObjects(objects)
    .filter((o) => o.studioRole === 'prompt')
    .map((o) => String(o.text ?? '').replace(/\u00A0/g, ' '))
}

const REMOTE: LifeTimelineRemoteData = {
  childhood: [
    'What did your childhood home smell like on a Sunday?',
    'Who lived next door, and what do you remember about them?',
    'What was your favourite thing to do after school?',
    'What game did you play outdoors until it got dark?',
  ],
  school: [
    'What subject made the day feel interesting?',
    'Who sat near you in class, and what do you remember about them?',
    'What did the school hallway smell like?',
    'What game filled the playground at break time?',
  ],
}

const CTX = (
  remote: LifeTimelineRemoteData | undefined = REMOTE,
): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const base = {
  ...buildDefaultConfig(lifeTimelineTemplate),
  seed: 42,
  fontFamily: 'Inter',
  stage: 'childhood',
  promptsPerStage: 4,
}

describe('life-timeline', () => {
  it('is deterministic given the same remoteData', () => {
    resetObjectCounter()
    const a = lifeTimelineTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = lifeTimelineTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('emits one page for the selected stage', () => {
    resetObjectCounter()
    const pages = lifeTimelineTemplate.generate(
      { ...base, stage: 'school' },
      CTX(),
    )
    expect(pages.length).toBe(1)
    expect(
      promptTexts(pages[0]!.objects).some((t) =>
        t.includes('What subject made the day feel interesting?'),
      ),
    ).toBe(true)
    expect(promptTexts(pages[0]!.objects).some((t) => t === 'SCHOOL DAYS')).toBe(
      false,
    )
  })

  it('does not print a life-stage theme title on the canvas', () => {
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    const titles = promptTexts(page.objects)
    expect(titles.some((t) => t === 'CHILDHOOD')).toBe(false)
    expect(titles.some((t) => t === 'SCHOOL DAYS')).toBe(false)
  })

  it('prints two writing lines under each prompt', () => {
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    const prompts = questionPrompts(page.objects)
    const lines = writingLines(page.objects)
    expect(prompts.length).toBe(REMOTE.childhood!.length)
    expect(lines.length).toBe(prompts.length * 2)
  })

  it('keeps all six prompts when promptsPerStage is 6', () => {
    resetObjectCounter()
    const remote: LifeTimelineRemoteData = {
      childhood: Array.from({ length: 6 }, (_, i) =>
        `What sensory memory number ${i + 1} from home still feels vivid on an ordinary afternoon?`,
      ),
    }
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood', promptsPerStage: 6 },
      CTX(remote),
    )
    const prompts = questionPrompts(page.objects)
    const lines = writingLines(page.objects)
    expect(prompts.length).toBe(6)
    expect(lines.length).toBe(12)
  })

  it('never drops prompts to fit — count matches remote data', () => {
    resetObjectCounter()
    const remote: LifeTimelineRemoteData = {
      childhood: Array.from({ length: 6 }, (_, i) =>
        `What long childhood memory number ${i + 1} about home, family, play, food, and pets still feels vivid?`,
      ),
    }
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood', promptsPerStage: 6 },
      ctx,
    )
    expect(questionPrompts(page.objects).length).toBe(6)
  })

  it('keeps writing lines comfortably spaced', () => {
    resetObjectCounter()
    const remote: LifeTimelineRemoteData = {
      childhood: Array.from({ length: 6 }, (_, i) => `What memory number ${i + 1}?`),
    }
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood', promptsPerStage: 6 },
      CTX(remote),
    )
    const lines = writingLines(page.objects)
      .map((l) => l.absY1 ?? 0)
      .toSorted((a, b) => a - b)
    const gap = (lines[1] ?? 0) - (lines[0] ?? 0)
    expect(gap).toBeGreaterThanOrEqual(WRITING_LINE_GAP_MIN - 0.5)
  })

  it('matches gap above the first writing line to the gap between lines', () => {
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    const flat = flattenObjects(page.objects)
    const prompt = flat.find(
      (o) =>
        o.studioRole === 'prompt' &&
        String(o.text ?? '').endsWith('?'),
    )!
    const lines = writingLines(page.objects).slice(0, 2)
    const fontSize = prompt.fontSize ?? 1
    const wraps = Math.max(
      1,
      Math.ceil(
        (String(prompt.text ?? '').length * fontSize * 0.55 + fontSize) /
          (prompt.width ?? 1),
      ),
    )
    const promptBottom = prompt.absTop + wraps * fontSize * 1.28
    const gapToFirst = (lines[0]!.absY1 ?? 0) - promptBottom
    const gapBetween = (lines[1]!.absY1 ?? 0) - (lines[0]!.absY1 ?? 0)
    expect(Math.abs(gapToFirst - gapBetween)).toBeLessThan(0.5)
  })

  it('groups each prompt with its writing lines, then groups the stage', () => {
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    const stageGroup = page.objects.find((o) => o.type === 'group')
    expect(stageGroup).toBeTruthy()
    const nested = (stageGroup!.objects ?? []) as StudioFabricObject[]
    const promptUnits = nested.filter((o) => o.type === 'group')
    expect(promptUnits.length).toBe(REMOTE.childhood!.length)
    for (const unit of promptUnits) {
      const kids = (unit.objects ?? []) as StudioFabricObject[]
      expect(kids.some((o) => o.type === 'textbox')).toBe(true)
      expect(kids.filter((o) => o.type === 'line').length).toBe(2)
    }
  })

  it('produces NO answer objects (this is a keepsake, not a test)', () => {
    expect(lifeTimelineTemplate.producesAnswerKey).toBe(false)
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    expect(
      flattenObjects(page.objects).filter((o) => o.studioRole === 'answer').length,
    ).toBe(0)
  })

  it('always prints the “skip any question” line', () => {
    resetObjectCounter()
    const [page] = lifeTimelineTemplate.generate(
      { ...base, stage: 'childhood' },
      CTX(),
    )
    const texts = flattenObjects(page.objects).map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes(SAFETY_LINE))).toBe(true)
    expect(STAGE_INSTRUCTION.includes(SAFETY_LINE)).toBe(true)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      lifeTimelineTemplate.generate(base, { ...CTX(), remoteData: undefined }),
    ).not.toThrow()
  })

  it('keeps max density inside the safe margin', () => {
    resetObjectCounter()
    const dense: LifeTimelineRemoteData = {
      childhood: Array.from({ length: 6 }, (_, i) =>
        `What sensory memory number ${i + 1} from home still feels vivid and warm on an ordinary afternoon?`,
      ),
    }
    const ctx = CTX(dense)
    const pages = lifeTimelineTemplate.generate(
      {
        ...base,
        stage: 'childhood',
        promptsPerStage: 6,
      },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('emits one page for a custom stage label', () => {
    resetObjectCounter()
    const remote = {
      'Military years': [
        'What uniform detail do you still picture clearly?',
        'Who shared a laugh with you on an ordinary day?',
      ],
    }
    const pages = lifeTimelineTemplate.generate(
      {
        ...base,
        customStages: true,
        customStagesText: 'Military years',
      },
      CTX(remote),
    )
    expect(pages.length).toBe(1)
    expect(
      promptTexts(pages[0]!.objects).some((t) =>
        t.includes('What uniform detail do you still picture clearly?'),
      ),
    ).toBe(true)
    expect(promptTexts(pages[0]!.objects).some((t) => t === 'MILITARY YEARS')).toBe(
      false,
    )
  })

  it('reads the first stage from a legacy stages array', () => {
    resetObjectCounter()
    const pages = lifeTimelineTemplate.generate(
      { ...base, stage: undefined, stages: ['school', 'work'] },
      CTX(),
    )
    expect(pages.length).toBe(1)
    expect(
      promptTexts(pages[0]!.objects).some((t) =>
        t.includes('What subject made the day feel interesting?'),
      ),
    ).toBe(true)
  })
})
