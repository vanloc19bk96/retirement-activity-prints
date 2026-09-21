import { describe, it, expect } from 'vitest'
import type { StudioGenerateContext, StudioFabricObject } from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from './studio-fabric-builders'
import { harvestAnswers } from './studio-answer-key'
import type { StudioTemplateDefinition } from '@/types/studio-template.types'
import { contentFingerprint } from './studio-content-fingerprint'
import { clearStudioRecentContent } from './studio-variety'

export { contentFingerprint } from './studio-content-fingerprint'

export const STUDIO_TEST_CTX: StudioGenerateContext = {
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
}

function objectExtent(o: StudioFabricObject): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const scaleX = o.scaleX ?? 1
  const scaleY = o.scaleY ?? 1
  const width = (o.width ?? (o.radius != null ? o.radius * 2 : 0)) * scaleX
  const height = (o.height ?? (o.radius != null ? o.radius * 2 : 0)) * scaleY
  let left = o.left
  let top = o.top
  if (o.originX === 'center') left -= width / 2
  if (o.originX === 'right') left -= width
  if (o.originY === 'center') top -= height / 2
  if (o.originY === 'bottom') top -= height
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  }
}

export function assertObjectsInSafeMargin(
  objects: StudioFabricObject[],
  ctx: StudioGenerateContext = STUDIO_TEST_CTX,
): void {
  const maxRight = ctx.pageWidth - ctx.margin.right + 1
  const maxBottom = ctx.pageHeight - ctx.margin.bottom + 1
  for (const o of objects) {
    const extent = objectExtent(o)
    expect(extent.left).toBeGreaterThanOrEqual(ctx.margin.left - 1)
    expect(extent.top).toBeGreaterThanOrEqual(ctx.margin.top - 1)
    expect(extent.right).toBeLessThanOrEqual(maxRight)
    expect(extent.bottom).toBeLessThanOrEqual(maxBottom)
  }
}

/**
 * Guards against duplicate worksheets across books and users. Seed space is
 * 32-bit, but the real ceiling is how many distinct puzzles a template can
 * express — a template whose content repeats every few seeds will ship the same
 * page twice inside one book.
 */
export function assertGeneratorEntropy(
  template: StudioTemplateDefinition,
  options?: {
    /** Distinct seeds to sample. Default 60. */
    seeds?: number
    /** Minimum share of sampled seeds that must yield unique content. Default 1. */
    minDistinctRatio?: number
    configOverrides?: Record<string, unknown>
    /** Extra generate-context fields (e.g. AI `remoteData` fixtures). */
    contextOverrides?: Partial<StudioGenerateContext>
  },
): void {
  const seedCount = options?.seeds ?? 60
  const minDistinctRatio = options?.minDistinctRatio ?? 1
  const config = {
    ...buildDefaultConfig(template),
    fontFamily: 'PT Serif',
    ...options?.configOverrides,
  }

  describe(`${template.key} entropy`, () => {
    it(`yields distinct content for ${seedCount} seeds`, () => {
      const seen = new Set<string>()
      for (let i = 0; i < seedCount; i++) {
        // Coprime stride so samples spread across the seed space, not 1..N.
        const seed = 1_000 + i * 7_919
        resetObjectCounter()
        const pages = template.generate(
          { ...config, seed },
          { ...STUDIO_TEST_CTX, ...options?.contextOverrides, seed },
        )
        seen.add(pages.map((page) => contentFingerprint(page.objects)).join('#'))
      }
      expect(seen.size / seedCount).toBeGreaterThanOrEqual(minDistinctRatio)
    })
  })
}

export function runGeneratorContractTests(
  template: StudioTemplateDefinition,
  options?: {
    expectAnswers?: boolean
    /** Fixed-layout templates (no RNG) skip seed-variance. Default true. */
    expectSeedVariance?: boolean
    configOverrides?: Record<string, unknown>
    /** Extra generate-context fields (e.g. AI `remoteData` fixtures). */
    contextOverrides?: Partial<StudioGenerateContext>
  },
): void {
  const expectAnswers = options?.expectAnswers ?? template.producesAnswerKey
  const expectSeedVariance = options?.expectSeedVariance ?? true
  const config = {
    ...buildDefaultConfig(template),
    seed: 42,
    fontFamily: 'PT Serif',
    ...options?.configOverrides,
  }
  const ctx: StudioGenerateContext = {
    ...STUDIO_TEST_CTX,
    ...options?.contextOverrides,
  }

  describe(template.key, () => {
    it('is deterministic for a given seed', () => {
      clearStudioRecentContent()
      resetObjectCounter()
      const a = template.generate(config, ctx)
      // Templates that record variety (AI avoid-lists, magic-square banks) must
      // start each draw from a clean ledger or the second call avoids the first.
      clearStudioRecentContent()
      resetObjectCounter()
      const b = template.generate(config, ctx)
      expect(a).toEqual(b)
    })

    if (expectSeedVariance) {
      it('produces different output for a different seed', () => {
        clearStudioRecentContent()
        resetObjectCounter()
        const a = JSON.stringify(template.generate(config, ctx))
        clearStudioRecentContent()
        resetObjectCounter()
        const b = JSON.stringify(
          template.generate({ ...config, seed: 7 }, { ...ctx, seed: 7 }),
        )
        expect(a).not.toEqual(b)
      })
    } else {
      it('is seed-invariant (fixed layout)', () => {
        clearStudioRecentContent()
        resetObjectCounter()
        const a = JSON.stringify(template.generate(config, ctx))
        clearStudioRecentContent()
        resetObjectCounter()
        const b = JSON.stringify(
          template.generate({ ...config, seed: 7 }, { ...ctx, seed: 7 }),
        )
        expect(a).toEqual(b)
      })
    }

    it('keeps every object inside the safe margin', () => {
      resetObjectCounter()
      const pages = template.generate(config, ctx)
      for (const page of pages) {
        assertObjectsInSafeMargin(page.objects, ctx)
      }
    })

    it('tags every object with the template key and instance id', () => {
      resetObjectCounter()
      const pages = template.generate(config, ctx)
      for (const page of pages) {
        for (const o of page.objects) {
          expect(o.studioTemplateKey).toBe(template.key)
          expect(o.studioInstanceId).toBe(ctx.instanceId)
        }
      }
    })

    if (expectAnswers) {
      it('emits hidden answer objects', () => {
        resetObjectCounter()
        const pages = template.generate(config, ctx)
        const answers = pages.flatMap((p) => harvestAnswers(p.objects))
        expect(answers.length).toBeGreaterThan(0)
        expect(answers.every((o) => o.visible === false)).toBe(true)
      })
    }
  })
}
