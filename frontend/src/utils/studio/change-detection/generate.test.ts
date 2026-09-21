import { describe, it, expect } from 'vitest'
import { changeDetectionTemplate, buildChangePair } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentFingerprint, runGeneratorContractTests } from '../studio-generator-test'
import { STUDIO_ANSWER_INK_MONO } from '@/constants/studio.constants'
import { resolveStudioOwnerKey } from '../studio-owner-icon-pool'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import type { ChangeType } from './trials'
import { CHANGE_DETECTION_MASTER_ICONS } from './icons'

const CTX: StudioGenerateContext = {
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  ownerKey: 'user:test-a',
}

const TEST_POOL = CHANGE_DETECTION_MASTER_ICONS.slice(0, 28)

const base: Record<string, unknown> = {
  ...buildDefaultConfig(changeDetectionTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(changeDetectionTemplate)

describe('change-detection correctness', () => {
  it('produces exactly changeCount hidden answer rings', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(base, CTX)
    const rings = harvestAnswers(page.objects)
    expect(rings.length).toBe(Number(base.changeCount))
    expect(rings.every((o) => o.visible === false)).toBe(true)
  })

  it('clamps changeCount to grid area (never all cells)', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(
      { ...base, gridSize: 3, changeCount: 12 },
      CTX,
    )
    const rings = harvestAnswers(page.objects)
    expect(rings.length).toBeLessThanOrEqual(3 * 3 - 1)
    expect(rings.length).toBe(8)
  })

  it('keeps “What changed?” on one line', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(base, CTX)
    const label = page.objects.find(
      (o) => typeof o.text === 'string' && o.text.includes('changed?'),
    )
    expect(label?.text).toBe('What\u00a0changed?')
  })

  it('solution page shows What changed? grid only — no Study this', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(base, CTX)
    expect(page.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page.answerSourceObjects ?? page.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const texts = keyObjects.map((o) =>
      String(o.text ?? '').replace(/\u00a0/g, ' '),
    )
    expect(texts.some((t) => t.includes('changed?'))).toBe(true)
    expect(texts.some((t) => t === 'Study this')).toBe(false)
    const grids = keyObjects.filter(
      (o) => o.type === 'group' && o.studioRole === 'decoration',
    )
    expect(grids).toHaveLength(1)
    expect(harvestAnswers(keyObjects).length).toBe(Number(base.changeCount))

    // Glyphs must remain — omit must not strip Phosphor prompt groups.
    const icons: unknown[] = []
    const walk = (objs: typeof keyObjects): void => {
      for (const o of objs) {
        if (o.data?.source === 'phosphor-icon') icons.push(o.data)
        if (Array.isArray(o.objects)) walk(o.objects as typeof keyObjects)
      }
    }
    walk(keyObjects)
    expect(icons.length).toBe(Number(base.gridSize ?? 4) ** 2)
  })

  it('stacks two equal-sized grids', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(
      { ...base, gridSize: 6 },
      CTX,
    )
    // Grid shells are decoration groups; Phosphor icons are prompt groups.
    const grids = page.objects.filter(
      (o) => o.type === 'group' && o.studioRole === 'decoration',
    )
    expect(grids).toHaveLength(2)
    expect(grids[0].width).toBe(grids[1].width)
    expect(grids[0].height).toBe(grids[1].height)
    expect(grids[0].width).toBe(grids[0].height)
  })

  it('emits Phosphor duotone icons from the full catalog', () => {
    resetObjectCounter()
    const [page] = changeDetectionTemplate.generate(base, CTX)
    const icons: { source?: unknown; iconName?: unknown; phosphorWeight?: unknown }[] =
      []
    const walk = (objs: typeof page.objects): void => {
      for (const o of objs) {
        if (o.data?.source === 'phosphor-icon') icons.push(o.data)
        if (Array.isArray(o.objects)) walk(o.objects as typeof page.objects)
      }
    }
    walk(page.objects)
    expect(icons.length).toBeGreaterThan(0)
    const catalog = new Set(CHANGE_DETECTION_MASTER_ICONS)
    for (const icon of icons) {
      expect(catalog.has(String(icon.iconName))).toBe(true)
      expect(icon.phosphorWeight).toBe('duotone')
    }
  })

  it('same seed is deterministic regardless of owner', () => {
    resetObjectCounter()
    const [pageA] = changeDetectionTemplate.generate(base, {
      ...CTX,
      ownerKey: 'user:seller-a',
    })
    resetObjectCounter()
    const [pageB] = changeDetectionTemplate.generate(base, {
      ...CTX,
      ownerKey: 'user:seller-b',
    })
    expect(contentFingerprint(pageA.objects)).toBe(contentFingerprint(pageB.objects))
  })

  it('same seed is deterministic across runs', () => {
    resetObjectCounter()
    const [a] = changeDetectionTemplate.generate(base, CTX)
    resetObjectCounter()
    const [b] = changeDetectionTemplate.generate(base, CTX)
    expect(contentFingerprint(a.objects)).toBe(contentFingerprint(b.objects))
  })

  it('buildChangePair marks a cell changed iff study ≠ test', () => {
    const rng = createRng(99)
    for (const changeType of ['shape', 'rotation', 'mixed'] as ChangeType[]) {
      const { study, test, changed } = buildChangePair(
        4,
        3,
        changeType,
        rng,
        TEST_POOL,
      )
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const differs =
            study[r][c].glyph !== test[r][c].glyph ||
            study[r][c].rotationDeg !== test[r][c].rotationDeg
          expect(changed[r][c]).toBe(differs)
        }
      }
      const changeMarks = changed.flat().filter(Boolean).length
      expect(changeMarks).toBe(3)
    }
  })

  it('uses the full Phosphor duotone catalog', () => {
    expect(CHANGE_DETECTION_MASTER_ICONS.length).toBe(1512)
    expect(CHANGE_DETECTION_MASTER_ICONS).toContain('pizza')
    expect(CHANGE_DETECTION_MASTER_ICONS).toContain('house')
    expect(CHANGE_DETECTION_MASTER_ICONS).toContain('car')
  })
})

describe('studio-owner-icon-pool', () => {
  it('resolveStudioOwnerKey prefers user over book', () => {
    expect(resolveStudioOwnerKey({ userId: 7, bookId: 'b1' })).toBe('user:7')
    expect(resolveStudioOwnerKey({ userId: null, bookId: 'b1' })).toBe('book:b1')
    expect(resolveStudioOwnerKey({})).toBe('anonymous')
  })
})
