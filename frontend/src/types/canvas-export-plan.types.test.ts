import { describe, expect, it } from 'vitest'

import { getPdfChunkPageSize } from '@/types/canvas-export-plan.types'

describe('getPdfChunkPageSize', () => {
  it('splits ~40-page image-dense books so one jsPDF chunk cannot OOM', () => {
    expect(getPdfChunkPageSize(40)).toBe(16)
    expect(getPdfChunkPageSize(41)).toBe(12)
  })

  it('uses tighter chunks for larger books', () => {
    expect(getPdfChunkPageSize(101)).toBe(12)
    expect(getPdfChunkPageSize(201)).toBe(8)
  })

  it('keeps a larger chunk for small books', () => {
    expect(getPdfChunkPageSize(10)).toBe(32)
  })
})
