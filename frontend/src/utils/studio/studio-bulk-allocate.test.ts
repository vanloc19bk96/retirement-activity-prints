import { describe, expect, it } from 'vitest'
import {
  estimateStudioBulkInsertPages,
  estimateStudioInstancePageCount,
} from './studio-bulk-allocate'

describe('estimateStudioInstancePageCount', () => {
  it('counts puzzle pages only when no answer key', () => {
    expect(
      estimateStudioInstancePageCount({ pageCount: 2, producesAnswerKey: false }),
    ).toBe(2)
  })

  it('assumes one key page per puzzle page when answer key is on', () => {
    expect(
      estimateStudioInstancePageCount({ pageCount: 1, producesAnswerKey: true }),
    ).toBe(2)
    expect(
      estimateStudioInstancePageCount({ pageCount: 2, producesAnswerKey: true }),
    ).toBe(4)
  })
})

describe('estimateStudioBulkInsertPages', () => {
  it('inserts full stride for every instance in insert mode', () => {
    expect(
      estimateStudioBulkInsertPages({
        instanceCount: 5,
        pagesPerInstance: 2,
        mode: 'insert',
      }),
    ).toBe(10)
  })

  it('reuses first-instance pages in replace mode', () => {
    expect(
      estimateStudioBulkInsertPages({
        instanceCount: 5,
        pagesPerInstance: 2,
        mode: 'replace',
        firstInstanceReusablePages: 2,
      }),
    ).toBe(8)
  })
})
