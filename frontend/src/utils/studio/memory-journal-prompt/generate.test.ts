import { describe, it, expect } from 'vitest'
import { memoryJournalPromptTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import type { MemoryJournalRemoteData } from '@/types/studio-reflective-writing.types'
import { estimateTextBoxWidth } from '../studio-layout'
import { JOURNAL_PROMPT_SIZE, JOURNAL_RULE_STROKE } from '../reflective-writing/copy'
import { SAFETY_LINE } from '../reflective-writing/safety'
import { resolveJournalTheme } from '../reflective-writing/theme'
import { STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'

const LONG_PROMPT_119_CHARS =
  'What quiet afternoon smell from your kitchen still feels familiar and comforting when you think back to ordinary days?'

function makePrompts(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return 'What made you smile today?'
    if (i === 1) return LONG_PROMPT_119_CHARS
    return `What gentle moment number ${i + 1} would you like to write about today?`
  })
}

const CTX = (
  prompts: string[] = makePrompts(2),
): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  seed: 42,
  instanceId: 'test-journal',
  remoteData: { prompts } satisfies MemoryJournalRemoteData,
})

const base = {
  ...buildDefaultConfig(memoryJournalPromptTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  promptsPerPage: 1,
  showDateLine: true,
  theme: 'general',
  timeFrame: 'mixed',
  tone: 'gentle',
}

function firstRuleY(page: { objects: { type?: string; studioRole?: string; y1?: number }[] }): number {
  const line = page.objects.find(
    (o) => o.type === 'line' && o.studioRole === 'structure',
  )
  return line?.y1 ?? -1
}

function promptTextOf(page: {
  objects: { studioRole?: string; text?: string }[]
}): string {
  return String(
    page.objects.find(
      (o) => o.studioRole === 'prompt' && String(o.text ?? '').endsWith('?'),
    )?.text ?? '',
  )
}

describe('memory-journal-prompt', () => {
  it('emits exactly one page per generate', () => {
    resetObjectCounter()
    const pages = memoryJournalPromptTemplate.generate(base, CTX(makePrompts(4)))
    expect(pages.length).toBe(1)
    expect(memoryJournalPromptTemplate.pageCount).toBe(1)
  })

  it('produces NO answer objects', () => {
    resetObjectCounter()
    const [page] = memoryJournalPromptTemplate.generate(base, CTX())
    expect(page.objects.filter((o) => o.studioRole === 'answer').length).toBe(0)
    expect(memoryJournalPromptTemplate.producesAnswerKey).toBe(false)
  })

  it('always prints the safety line', () => {
    resetObjectCounter()
    const [page] = memoryJournalPromptTemplate.generate(base, CTX())
    const texts = page.objects.map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes(SAFETY_LINE))).toBe(true)
  })

  it('LAYOUT: page has writing lines', () => {
    resetObjectCounter()
    const [page] = memoryJournalPromptTemplate.generate(base, CTX())
    const lines = page.objects.filter(
      (o) => o.type === 'line' && o.studioRole === 'structure',
    )
    expect(firstRuleY(page)).toBeGreaterThan(0)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((o) => o.stroke === STUDIO_RULE_MEDIUM)).toBe(true)
    expect(lines.every((o) => (o.strokeWidth ?? 0) >= JOURNAL_RULE_STROKE)).toBe(true)
  })

  it('LAYOUT: a long prompt does not shift the writing lines', () => {
    resetObjectCounter()
    const short = memoryJournalPromptTemplate.generate(base, CTX(['Hi?']))
    resetObjectCounter()
    const long = memoryJournalPromptTemplate.generate(
      base,
      CTX([LONG_PROMPT_119_CHARS]),
    )
    expect(firstRuleY(short[0]!)).toBe(firstRuleY(long[0]!))
  })

  it('uses the first remote prompt on the page', () => {
    resetObjectCounter()
    const [page] = memoryJournalPromptTemplate.generate(
      base,
      CTX(makePrompts(3)),
    )
    expect(promptTextOf(page)).toBe('What made you smile today?')
  })

  it('prompt textbox hugs the glyph run (no fat selection box)', () => {
    resetObjectCounter()
    const prompt = 'What made you smile today?'
    const [page] = memoryJournalPromptTemplate.generate(base, CTX([prompt]))
    const box = page.objects.find(
      (o) => o.studioRole === 'prompt' && String(o.text ?? '') === prompt,
    )
    expect(box?.width).toBe(
      estimateTextBoxWidth(prompt, JOURNAL_PROMPT_SIZE, Number.POSITIVE_INFINITY),
    )
  })

  it('keeps the page inside the safe margin', () => {
    resetObjectCounter()
    const [page] = memoryJournalPromptTemplate.generate(
      base,
      CTX([LONG_PROMPT_119_CHARS]),
    )
    assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      memoryJournalPromptTemplate.generate(base, {
        ...CTX(),
        remoteData: undefined,
      }),
    ).not.toThrow()
  })

  it('sends the theme the author sees, and validates empty custom text', () => {
    expect(
      resolveJournalTheme({
        customTheme: true,
        customThemeText: '  Gardening & birds  ',
      }),
    ).toBe('Gardening & birds')
    // Preset keys resolve to their own label — the backend keeps no theme table.
    expect(resolveJournalTheme({ theme: 'people', customTheme: false })).toBe(
      'Family & friends',
    )
    // "A bit of everything" is the absence of a theme, not a subject.
    expect(resolveJournalTheme({ theme: 'general', customTheme: false })).toBe('')
    expect(
      memoryJournalPromptTemplate.validateConfig?.({
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toEqual({
      field: 'customThemeText',
      message: 'Enter a custom theme, or turn off Custom theme.',
    })
    expect(
      memoryJournalPromptTemplate.validateConfig?.({
        customTheme: true,
        customThemeText: 'Choir nights',
      }),
    ).toBeNull()
  })
})
