import { describe, it, expect } from 'vitest'
import { memoryPalaceTemplate } from './generate'
import { resetObjectCounter } from '../studio-fabric-builders'
import { claimUniqueStudioOutputs } from '../studio-unique-content'
import {
  STUDIO_TEST_CTX,
  assertObjectsInSafeMargin,
  contentFingerprint,
  runGeneratorContractTests,
} from '../studio-generator-test'

function buildConfig(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    fontFamily: 'PT Serif',
    seed: 1,
    title: 'Memory Palace Builder',
    showInstructions: true,
  }
  for (const field of memoryPalaceTemplate.configSchema) {
    config[field.key] = field.default
  }
  return { ...config, ...overrides }
}

runGeneratorContractTests(memoryPalaceTemplate)

describe('memory-palace uniqueness', () => {
  // House keeps axis-aligned stops; uniqueness comes from whole-field nudge + retries.
  it('claims 50 unique house sheets via allocator', async () => {
    const usedSeeds = new Set<number>()
    const usedFingerprints = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const claimed = await claimUniqueStudioOutputs({
        usedSeeds,
        usedFingerprints,
        build: async (seed) => {
          resetObjectCounter()
          return memoryPalaceTemplate.generate(
            buildConfig({ seed, routeShape: 'house' }) as never,
            { ...STUDIO_TEST_CTX, seed },
          )
        },
      })
      expect(claimed.ok).toBe(true)
    }
    expect(usedFingerprints.size).toBe(50)
  })

  it.each(['street', 'path'] as const)(
    'seed batch yields distinct %s sheets (no duplicates)',
    (routeShape) => {
      const bulkTotal = 50
      const seen = new Set<string>()
      for (let i = 0; i < bulkTotal; i++) {
        const seed = 2_000 + i * 11_003
        resetObjectCounter()
        const [page] = memoryPalaceTemplate.generate(
          buildConfig({ seed, routeShape }) as never,
          { ...STUDIO_TEST_CTX, seed },
        )
        seen.add(contentFingerprint(page!.objects))
      }
      expect(seen.size).toBe(bulkTotal)
    },
  )
})

describe('memory-palace layout', () => {
  it('emits a route group and a loci table group', () => {
    resetObjectCounter()
    const [page] = memoryPalaceTemplate.generate(buildConfig() as never, STUDIO_TEST_CTX)
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
  })

  it('keeps house connectors axis-aligned', () => {
    resetObjectCounter()
    const [page] = memoryPalaceTemplate.generate(
      buildConfig({ routeShape: 'house', lociCount: 8 }) as never,
      STUDIO_TEST_CTX,
    )
    const connectors: {
      x1?: number
      y1?: number
      x2?: number
      y2?: number
      strokeDashArray?: number[]
    }[] = []
    const walk = (list: NonNullable<typeof page>['objects']): void => {
      for (const o of list) {
        if (o.objects) walk(o.objects)
        if (o.type === 'line' && o.strokeDashArray?.length) connectors.push(o)
      }
    }
    walk(page!.objects)
    expect(connectors.length).toBe(7) // 8 stops → 7 segments
    for (const line of connectors) {
      const isHorizontal = line.y1 === line.y2
      const isVertical = line.x1 === line.x2
      expect(isHorizontal || isVertical).toBe(true)
    }
  })

  it('keeps max loci count inside the safe margin', () => {
    resetObjectCounter()
    const [page] = memoryPalaceTemplate.generate(
      buildConfig({ lociCount: 12 }) as never,
      STUDIO_TEST_CTX,
    )
    assertObjectsInSafeMargin(page!.objects)
  })
})
