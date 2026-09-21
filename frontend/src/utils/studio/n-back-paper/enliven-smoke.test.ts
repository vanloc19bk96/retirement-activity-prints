/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { util } from 'fabric'
import { nBackPaperTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX: StudioGenerateContext = {
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
}

describe('n-back-paper enliven', () => {
  it.each([
    { mode: 'judgement', alphabet: 'letters' },
    { mode: 'judgement', alphabet: 'digits' },
    { mode: 'judgement', alphabet: 'shapes' },
    { mode: 'recall', alphabet: 'letters' },
    { mode: 'recall', alphabet: 'shapes' },
  ] as const)(
    'Fabric can enliven $mode / $alphabet',
    async ({ mode, alphabet }) => {
      resetObjectCounter()
      const pages = nBackPaperTemplate.generate(
        {
          ...buildDefaultConfig(nBackPaperTemplate),
          seed: 42,
          fontFamily: 'Inter',
          mode,
          alphabet,
        },
        CTX,
      )
      expect(pages.length).toBeGreaterThan(0)
      expect(pages[0]!.objects.length).toBeGreaterThan(0)

      for (const page of pages) {
        const live = await util.enlivenObjects(page.objects as never[])
        expect(live.length).toBe(page.objects.length)
        expect(live.every((o) => o != null)).toBe(true)
      }

      const answers = harvestAnswers(pages[0]!.objects)
      expect(answers.length).toBeGreaterThan(0)
      const keyObjects = buildAnswerPage(pages[0]!.objects, '#111111')
      const keyLive = await util.enlivenObjects(keyObjects as never[])
      expect(keyLive.length).toBe(keyObjects.length)
      expect(keyLive.every((o) => o != null)).toBe(true)
    },
    30_000,
  )
})
