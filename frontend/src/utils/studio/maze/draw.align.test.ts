/**
 * @vitest-environment jsdom
 */
import { Group, util } from 'fabric'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_TEST_CTX } from '../studio-generator-test'
import { mazeTemplate } from './generate'

function mazeGroup(objects: readonly StudioFabricObject[]): StudioFabricObject {
  const group = objects.find((obj) => obj.type === 'group')
  if (!group) throw new Error('maze group missing')
  return group
}

describe('maze finish arrow', () => {
  it('centres the exit stroke on the finish arrow', async () => {
    resetObjectCounter()
    const [out] = mazeTemplate.generate(
      { ...buildDefaultConfig(mazeTemplate), seed: 42, title: 'Game 1' },
      STUDIO_TEST_CTX,
    )
    const [live] = (await util.enlivenObjects([mazeGroup(out!.objects)] as never[])) as Group[]
    const kids = live.getObjects()
    const arrows = kids
      .filter((obj) => obj.type === 'polygon')
      .toSorted((a, b) => (a.top ?? 0) - (b.top ?? 0))
    const finish = arrows[1]!
    const finishX = finish.getCenterPoint().x
    const exit = kids
      .filter((obj) => obj.type === 'line' && (obj.height ?? 0) > (obj.width ?? 0))
      .toSorted(
        (a, b) =>
          Math.abs(a.getCenterPoint().x - finishX) - Math.abs(b.getCenterPoint().x - finishX),
      )[0]

    expect(exit).toBeDefined()
    expect(Math.abs(exit!.getCenterPoint().x - finishX)).toBeLessThanOrEqual(0.01)
    live.dispose?.()
  })
})
