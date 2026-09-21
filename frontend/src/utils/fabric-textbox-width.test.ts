import { describe, expect, it, vi } from 'vitest'
import {
  applyFabricTextboxWidthAfterMetricChange,
  fitFabricTextboxWidthToUnwrappedLine,
  shouldRefitFabricTextboxToUnwrappedLine,
} from './fabric-textbox-width'

describe('fabric-textbox-width', () => {
  it('fits width to the unwrapped run, not the longest word', () => {
    const set = vi.fn()
    const initDimensions = vi.fn()
    const target = {
      type: 'textbox',
      text: 'Study the grid. Then turn the page',
      width: 120,
      minWidth: 1,
      calcTextWidth: vi.fn().mockReturnValue(420),
      initDimensions,
      set,
    }

    fitFabricTextboxWidthToUnwrappedLine(target)

    expect(set).toHaveBeenCalledWith('width', 10_000)
    expect(set).toHaveBeenCalledWith('width', 422)
    expect(initDimensions).toHaveBeenCalled()
  })

  it('refits single visual-line labels and collapsed one-word boxes', () => {
    const singleLine = {
      type: 'textbox',
      text: 'Study the grid',
      width: 200,
      _textLines: [['Study the grid']],
      calcTextWidth: () => 180,
      initDimensions: vi.fn(),
    }
    expect(shouldRefitFabricTextboxToUnwrappedLine(singleLine)).toBe(true)

    const collapsed = {
      type: 'textbox',
      text: 'Study the grid Then turn',
      width: 40,
      dynamicMinWidth: 38,
      _textLines: [['Study'], ['the'], ['grid'], ['Then'], ['turn']],
      calcTextWidth: () => 38,
      initDimensions: vi.fn(),
    }
    expect(shouldRefitFabricTextboxToUnwrappedLine(collapsed)).toBe(true)
  })

  it('keeps intentional soft-wrapped paragraphs at column width', () => {
    const paragraph = {
      type: 'textbox',
      text: 'A long story passage that wraps across several lines without hard breaks',
      width: 400,
      dynamicMinWidth: 48,
      _textLines: [['A long story'], ['passage that'], ['wraps across'], ['several lines']],
      calcTextWidth: () => 180,
      initDimensions: vi.fn(),
      set: vi.fn(),
    }
    expect(shouldRefitFabricTextboxToUnwrappedLine(paragraph)).toBe(false)

    applyFabricTextboxWidthAfterMetricChange(paragraph, false)
    expect(paragraph.set).not.toHaveBeenCalled()
    expect(paragraph.initDimensions).toHaveBeenCalled()
  })

  it('skips multi-line textboxes with hard breaks', () => {
    const set = vi.fn()
    fitFabricTextboxWidthToUnwrappedLine({
      type: 'textbox',
      text: 'Line one\nLine two',
      width: 100,
      calcTextWidth: () => 50,
      set,
    })
    expect(set).not.toHaveBeenCalled()
    expect(
      shouldRefitFabricTextboxToUnwrappedLine({
        type: 'textbox',
        text: 'Line one\nLine two',
        calcTextWidth: () => 50,
        initDimensions: vi.fn(),
      }),
    ).toBe(false)
  })
})
