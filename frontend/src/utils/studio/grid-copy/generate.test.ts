import { describe, it, expect } from 'vitest'
import { gridCopyTemplate } from './generate'
import { resetObjectCounter } from '../studio-fabric-builders'
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
    title: 'Grid Copy',
    showInstructions: true,
  }
  for (const field of gridCopyTemplate.configSchema) {
    config[field.key] = field.default
  }
  return { ...config, ...overrides }
}

function objectBottom(o: {
  top: number
  height?: number
  fontSize?: number
  originY?: string
}): number {
  const h = o.height ?? (o.fontSize ?? 0)
  let top = o.top
  if (o.originY === 'center') top -= h / 2
  if (o.originY === 'bottom') top -= h
  return top + h
}

runGeneratorContractTests(gridCopyTemplate)

describe('grid-copy uniqueness', () => {
  it('seed batch yields distinct sheets (no duplicates)', () => {
    const bulkTotal = 50
    const seen = new Set<string>()
    for (let i = 0; i < bulkTotal; i++) {
      const seed = 2_000 + i * 11_003
      resetObjectCounter()
      const [page] = gridCopyTemplate.generate(buildConfig({ seed }) as never, {
        ...STUDIO_TEST_CTX,
        seed,
      })
      seen.add(contentFingerprint(page!.objects))
    }
    expect(seen.size).toBe(bulkTotal)
  })
})

describe('grid-copy layout', () => {
  it('stacks model above copy', () => {
    const pages = gridCopyTemplate.generate(buildConfig() as never, STUDIO_TEST_CTX)
    const labels = pages[0]!.objects.filter(
      (o) => o.type === 'textbox' && (o.text === 'Model' || o.text === 'Your copy'),
    )
    const model = labels.find((o) => o.text === 'Model')
    const copy = labels.find((o) => o.text === 'Your copy')
    expect(model).toBeDefined()
    expect(copy).toBeDefined()
    expect(model!.top).toBeLessThan(copy!.top)
  })

  it('keeps default and max grids inside the safe margin with stroke clearance', () => {
    const maxBottom = STUDIO_TEST_CTX.pageHeight - STUDIO_TEST_CTX.margin.bottom
    for (const gridSize of [5, 10]) {
      const pages = gridCopyTemplate.generate(
        buildConfig({ gridSize }) as never,
        { ...STUDIO_TEST_CTX, seed: 1 },
      )
      assertObjectsInSafeMargin(pages[0]!.objects)
      const lowest = Math.max(...pages[0]!.objects.map(objectBottom))
      expect(lowest).toBeLessThanOrEqual(maxBottom - 16)
    }
  })
})
