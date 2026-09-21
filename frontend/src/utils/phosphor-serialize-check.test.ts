/**
 * @vitest-environment jsdom
 */
import { util } from 'fabric'
import { describe, expect, it } from 'vitest'

import {
  applyPhosphorSecondaryFill,
  createFabricIconGroupFromPhosphorSvg,
  isPhosphorViewBoxFrame,
  PHOSPHOR_SERIALIZE_PROPS,
  readPhosphorPrimaryFill,
  readPhosphorSecondaryFill,
} from './phosphor-fabric'

const DUOTONE_SVG =
  '<svg><path d="M10 10h20v20H10z" opacity="0.2"/><path d="M12 12h16v16H12z"/></svg>'

describe('phosphor icon serialize + toolbar layers', () => {
  it('keeps child data markers when serialized with PHOSPHOR_SERIALIZE_PROPS', async () => {
    const group = createFabricIconGroupFromPhosphorSvg(DUOTONE_SVG, { targetWidth: 48 })
    const serialized = group.toObject(PHOSPHOR_SERIALIZE_PROPS as never) as {
      objects?: Array<{ data?: Record<string, unknown> }>
    }
    expect(serialized.objects?.some((o) => o.data?.phosphorViewBoxFrame === true)).toBe(true)
    expect(serialized.objects?.some((o) => o.data?.phosphorDuotoneSecondary === true)).toBe(true)

    const [live] = (await util.enlivenObjects([
      { ...serialized, data: { source: 'phosphor-icon' } },
    ] as never[])) as unknown as Array<{ getObjects: () => unknown[]; dispose?: () => void }>
    expect(live.getObjects().some((child) => isPhosphorViewBoxFrame(child))).toBe(true)
    group.dispose()
    live.dispose?.()
  })

  it('does not paint the viewBox frame when child data was dropped', () => {
    const group = createFabricIconGroupFromPhosphorSvg(DUOTONE_SVG, { targetWidth: 48 })
    // Simulate legacy studio JSON that omitted nested `data`.
    for (const child of group.getObjects()) {
      child.set('data', undefined)
    }
    group.set('data', { source: 'phosphor-icon' })

    expect(readPhosphorPrimaryFill(group)).toBe('#4B4B4B')
    expect(readPhosphorSecondaryFill(group)).toBe('#D6D6D6')

    applyPhosphorSecondaryFill(group, '#ff00aa')
    const frame = group.getObjects().find((child) => isPhosphorViewBoxFrame(child))
    expect(frame).toBeTruthy()
    expect(String((frame as { fill?: unknown }).fill)).toMatch(/rgba?\s*\(\s*0/)
    expect(readPhosphorSecondaryFill(group)).toBe('#ff00aa')
    expect(readPhosphorPrimaryFill(group)).toBe('#4B4B4B')

    group.dispose()
  })
})
