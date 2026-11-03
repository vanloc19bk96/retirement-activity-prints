import { describe, expect, it } from 'vitest'

import { isCompleteBookCoverPageCount } from '@/utils/book-info'

describe('isCompleteBookCoverPageCount', () => {
  it('waits while a count is still being typed', () => {
    expect(isCompleteBookCoverPageCount('')).toBe(false)
    expect(isCompleteBookCoverPageCount('1')).toBe(false)
    expect(isCompleteBookCoverPageCount('12')).toBe(false)
  })

  it('accepts a count KDP allows', () => {
    expect(isCompleteBookCoverPageCount('24')).toBe(true)
    expect(isCompleteBookCoverPageCount('120')).toBe(true)
  })

  it('refuses a count KDP does not allow', () => {
    expect(isCompleteBookCoverPageCount('99999')).toBe(false)
    expect(isCompleteBookCoverPageCount('120.5')).toBe(false)
  })
})
