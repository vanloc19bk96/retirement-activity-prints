import { describe, expect, it } from 'vitest'
import { resetObjectCounter, type StudioTag } from './studio-fabric-builders'
import {
  buildCheckMark,
  isStudioCheckMark,
  STUDIO_CHECK_MARK_SOURCE,
} from './studio-check-mark'

const TAG: StudioTag = {
  templateKey: 'n-back-paper',
  instanceId: 'check-mark-test',
  pageRole: 'single',
}

describe('buildCheckMark', () => {
  it('emits a single-polyline vector group, never a ✓ textbox', () => {
    resetObjectCounter()
    const mark = buildCheckMark({ left: 10, top: 20, size: 24 }, TAG, 'answer')
    expect(isStudioCheckMark(mark)).toBe(true)
    expect(mark.data?.source).toBe(STUDIO_CHECK_MARK_SOURCE)
    expect(mark.type).toBe('group')
    expect(mark.studioRole).toBe('answer')
    expect(mark.visible).toBe(false)
    expect(mark.objects).toHaveLength(1)
    expect(mark.objects![0]!.type).toBe('polyline')
    expect(mark.objects![0]!.points).toHaveLength(3)
    expect(JSON.stringify(mark)).not.toContain('✓')
  })
})
