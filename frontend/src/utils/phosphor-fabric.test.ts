import { describe, expect, it } from 'vitest'
import {
  applyPhosphorPrimaryFill,
  applyPhosphorSecondaryFill,
  createFabricIconGroupFromPhosphorSvg,
  isPhosphorDuotoneSecondary,
  isPhosphorIconGroup,
  parsePhosphorSvgPaths,
  readPhosphorPrimaryFill,
  readPhosphorSecondaryFill,
} from './phosphor-fabric'

describe('parsePhosphorSvgPaths', () => {
  it('marks opacity paths as duotone secondary', () => {
    const svg =
      '<svg><path d="M1" opacity="0.2"/><path d="M2"/></svg>'
    const paths = parsePhosphorSvgPaths(svg)
    expect(paths).toEqual([
      { d: 'M1', isSecondary: true },
      { d: 'M2', isSecondary: false },
    ])
  })
})

describe('phosphor icon group toolbar helpers', () => {
  const duotoneSvg =
    '<svg><path d="M10 10h20v20H10z" opacity="0.2"/><path d="M12 12h16v16H12z"/></svg>'

  it('detects phosphor icon groups by data.source', () => {
    const group = createFabricIconGroupFromPhosphorSvg(duotoneSvg, { targetWidth: 48 })
    expect(isPhosphorIconGroup(group)).toBe(true)
    group.dispose()
  })

  it('reads and applies primary/secondary fills for toolbar colors', () => {
    const group = createFabricIconGroupFromPhosphorSvg(duotoneSvg, { targetWidth: 48 })
    expect(readPhosphorPrimaryFill(group)).toBe('#4B4B4B')
    expect(readPhosphorSecondaryFill(group)).toBe('#D6D6D6')

    applyPhosphorPrimaryFill(group, '#112233')
    applyPhosphorSecondaryFill(group, '#aabbcc')

    expect(readPhosphorPrimaryFill(group)).toBe('#112233')
    expect(readPhosphorSecondaryFill(group)).toBe('#aabbcc')

    const secondary = group.getObjects().filter((child) => isPhosphorDuotoneSecondary(child))
    expect(secondary).toHaveLength(1)
    expect(secondary[0]?.fill).toBe('#aabbcc')

    group.dispose()
  })
})
