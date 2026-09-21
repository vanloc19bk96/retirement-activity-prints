/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { util } from 'fabric'
import { whereWasItTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX: StudioGenerateContext = {
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
}

describe('where-was-it enliven', () => {
  it('Fabric can enliven generated objects', async () => {
    resetObjectCounter()
    const pages = whereWasItTemplate.generate(
      { ...buildDefaultConfig(whereWasItTemplate), seed: 42, fontFamily: 'Inter' },
      CTX,
    )
    for (const page of pages) {
      const live = await util.enlivenObjects(page.objects as never[])
      expect(live.length).toBe(page.objects.length)
      expect(live.every((o) => o != null)).toBe(true)
    }
    // Fabric font resolution makes this slow; 5s is not enough under parallel runs.
  }, 30_000)
})
