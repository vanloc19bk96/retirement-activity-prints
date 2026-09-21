import { describe, it, expect } from 'vitest'
import {
  objectExtent,
  textObjectHeight,
  unionObjectBounds,
} from './studio-object-bounds'
import { buildGroup, buildText, resetObjectCounter, type StudioTag } from './studio-fabric-builders'
import { FABRIC_FONT_SIZE_MULT } from './studio-text-metrics'
import type { StudioFabricObject } from '@/types/studio-template.types'

const TAG: StudioTag = {
  templateKey: 'test',
  instanceId: 'test-run',
  pageRole: 'single',
}

describe('textObjectHeight', () => {
  it('reserves the glyph box Fabric draws, not the bare font size', () => {
    // The old estimate was bare `fontSize` without Fabric's line-box
    // multiplier — short enough that "Hanger" lost the tail of its g.
    const height = textObjectHeight({
      type: 'textbox',
      left: 0,
      top: 0,
      width: 400,
      text: '10. Hanger',
      fontSize: 20,
    })
    expect(height).toBeGreaterThanOrEqual(Math.ceil(20 * FABRIC_FONT_SIZE_MULT))
  })

  it('counts the lines a narrow textbox wraps to', () => {
    const one = textObjectHeight({
      type: 'textbox',
      left: 0,
      top: 0,
      width: 4000,
      text: 'the quick brown fox jumps over the lazy dog',
      fontSize: 20,
    })
    const many = textObjectHeight({
      type: 'textbox',
      left: 0,
      top: 0,
      width: 120,
      text: 'the quick brown fox jumps over the lazy dog',
      fontSize: 20,
    })
    expect(many).toBeGreaterThan(one * 3)
  })
})

describe('objectExtent', () => {
  it('measures a rotated box by the area it actually covers', () => {
    // A word-search answer capsule: long, thin, laid on the 45° diagonal.
    const capsule: StudioFabricObject = {
      type: 'rect',
      left: 1000,
      top: 1000,
      width: 1000,
      height: 100,
      originX: 'center',
      originY: 'center',
      angle: 45,
      strokeWidth: 0,
    }
    const e = objectExtent(capsule)
    const spread = (1000 + 100) / Math.SQRT2
    expect(e.right - e.left).toBeCloseTo(spread, 0)
    expect(e.bottom - e.top).toBeCloseTo(spread, 0)
  })

  it('keeps un-rotated boxes on their origin', () => {
    const e = objectExtent({
      type: 'rect',
      left: 10,
      top: 20,
      width: 30,
      height: 40,
      originX: 'left',
      originY: 'top',
      strokeWidth: 0,
    })
    expect(e).toEqual({ left: 10, top: 20, right: 40, bottom: 60 })
  })
})

describe('buildGroup', () => {
  it('covers the last row of text in the shrink-wrapped bounds', () => {
    resetObjectCounter()
    const rows = ['10. Hanger', '20. Painting', '30. Blinds'].map((text, i) =>
      buildText(
        { left: 100, top: 100 + i * 40, text, width: 300, fontSize: 24 },
        TAG,
        'answer',
      ),
    )
    const bounds = unionObjectBounds(rows)!
    const lastRow = objectExtent(rows[2]!)
    expect(bounds.top + bounds.height).toBeGreaterThanOrEqual(lastRow.bottom)
  })

  it('draws live so Fabric cannot crop a child at the box edge', () => {
    resetObjectCounter()
    const child = buildText({ left: 0, top: 0, text: 'Hanger', fontSize: 24 }, TAG, 'answer')
    const group = buildGroup([child], { left: 0, top: 0, width: 10, height: 10 }, TAG)
    // Fabric rasterises a cached group at its own width/height; these bounds
    // are a layout rect the callers centre against, so caching has to go
    // instead of the box growing.
    expect(group.objectCaching).toBe(false)
    expect(group.width).toBe(10)
    expect(group.height).toBe(10)
  })
})
