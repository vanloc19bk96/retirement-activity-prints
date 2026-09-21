import { describe, expect, it } from 'vitest'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import {
  bumpStudioGameTitle,
  countStudioPuzzleInstances,
  findStudioInstanceEndPageIndex,
  formatStudioBulkTitleRange,
  isStudioAnswerKeyPage,
  nextStudioGameTitle,
  resolveStudioGeneratePlacement,
  resolveStudioInsertStartPageIndex,
  resolveStudioInstancePageSpan,
  resolveStudioReplaceStartPageIndex,
  studioGameOrdinalAtPageIndex,
  studioGameTitleAtPageIndex,
  toStudioSolutionTitle,
} from './studio-instance-pages'

function makeStore(pages: Record<number, object[]>): CanvasStateStore {
  return {
    getSerialized: (index: number) => {
      const objects = pages[index]
      return objects ? { objects } : null
    },
  } as unknown as CanvasStateStore
}

function studioObj(
  instanceId: string,
  pageRole: 'single' | 'study' | 'recall' | 'answers',
) {
  return {
    type: 'rect',
    studioInstanceId: instanceId,
    studioPageRole: pageRole,
    studioTemplateKey: 'test',
  }
}

describe('resolveStudioReplaceStartPageIndex', () => {
  it('keeps start when viewport is on the puzzle page', () => {
    const store = makeStore({
      0: [studioObj('puzzle-1', 'single')],
      1: [studioObj('puzzle-1', 'answers')],
    })
    expect(
      resolveStudioReplaceStartPageIndex({
        store,
        currentPageIndex: 0,
        templatePageCount: 1,
      }),
    ).toBe(0)
  })

  it('moves start back from answer-key page (1-page + key)', () => {
    const store = makeStore({
      0: [studioObj('sudoku-1', 'single')],
      1: [studioObj('sudoku-1', 'answers')],
    })
    expect(isStudioAnswerKeyPage(store, 1)).toBe(true)
    expect(
      resolveStudioReplaceStartPageIndex({
        store,
        currentPageIndex: 1,
        templatePageCount: 1,
      }),
    ).toBe(0)
  })

  it('moves start back from answer-key after a 2-page spread', () => {
    const store = makeStore({
      0: [studioObj('list-1', 'study')],
      1: [studioObj('list-1', 'recall')],
      2: [studioObj('list-1', 'answers')],
    })
    expect(
      resolveStudioReplaceStartPageIndex({
        store,
        currentPageIndex: 2,
        templatePageCount: 2,
      }),
    ).toBe(0)
  })

  it('moves start back from recall page of a 2-page spread', () => {
    const store = makeStore({
      0: [studioObj('story-1', 'study')],
      1: [studioObj('story-1', 'recall')],
    })
    expect(
      resolveStudioReplaceStartPageIndex({
        store,
        currentPageIndex: 1,
        templatePageCount: 2,
      }),
    ).toBe(0)
  })

  it('does not jump to an unrelated earlier instance', () => {
    const store = makeStore({
      0: [studioObj('old', 'single')],
      1: [studioObj('new', 'single')],
      2: [studioObj('new', 'answers')],
    })
    expect(
      resolveStudioReplaceStartPageIndex({
        store,
        currentPageIndex: 2,
        templatePageCount: 1,
      }),
    ).toBe(1)
  })
})

describe('resolveStudioInstancePageSpan', () => {
  it('counts only the current instance, not the next game', () => {
    const store = makeStore({
      0: [studioObj('a', 'single')],
      1: [studioObj('b', 'single')],
      2: [studioObj('c', 'single')],
    })
    expect(
      resolveStudioInstancePageSpan({
        store,
        startPageIndex: 1,
        interiorPageCount: 3,
      }),
    ).toBe(1)
  })

  it('includes the answer-key page of the same instance', () => {
    const store = makeStore({
      0: [studioObj('a', 'single')],
      1: [studioObj('a', 'answers')],
      2: [studioObj('b', 'single')],
    })
    expect(
      resolveStudioInstancePageSpan({
        store,
        startPageIndex: 0,
        interiorPageCount: 3,
      }),
    ).toBe(2)
    expect(findStudioInstanceEndPageIndex(store, 3, 'a')).toBe(1)
  })
})

describe('resolveStudioInsertStartPageIndex', () => {
  it('inserts after the recall page when viewport is on study', () => {
    const store = makeStore({
      0: [studioObj('study-1', 'study')],
      1: [studioObj('study-1', 'recall')],
    })
    expect(
      resolveStudioInsertStartPageIndex({
        store,
        currentPageIndex: 0,
        interiorPageCount: 2,
      }),
    ).toBe(2)
  })

  it('inserts after recall when viewport is already on recall', () => {
    const store = makeStore({
      0: [studioObj('study-1', 'study')],
      1: [studioObj('study-1', 'recall')],
    })
    expect(
      resolveStudioInsertStartPageIndex({
        store,
        currentPageIndex: 1,
        interiorPageCount: 2,
      }),
    ).toBe(2)
  })

  it('inserts after answer key when viewport is on the puzzle', () => {
    const store = makeStore({
      0: [studioObj('sudoku-1', 'single')],
      1: [studioObj('sudoku-1', 'answers')],
    })
    expect(
      resolveStudioInsertStartPageIndex({
        store,
        currentPageIndex: 0,
        interiorPageCount: 2,
      }),
    ).toBe(2)
  })

  it('falls back to current+1 on a non-studio page', () => {
    const store = makeStore({
      0: [{ type: 'rect' }],
    })
    expect(
      resolveStudioInsertStartPageIndex({
        store,
        currentPageIndex: 0,
        interiorPageCount: 1,
      }),
    ).toBe(1)
  })

  it('does not walk into a later unrelated instance', () => {
    const store = makeStore({
      0: [studioObj('a', 'study')],
      1: [studioObj('a', 'recall')],
      2: [studioObj('b', 'study')],
      3: [studioObj('b', 'recall')],
    })
    expect(
      resolveStudioInsertStartPageIndex({
        store,
        currentPageIndex: 0,
        interiorPageCount: 4,
      }),
    ).toBe(2)
  })
})

describe('resolveStudioGeneratePlacement', () => {
  it('fills empty page 1 in place on first generate', () => {
    const store = makeStore({})
    expect(
      resolveStudioGeneratePlacement({
        store,
        interiorPageCount: 1,
      }),
    ).toEqual({ startPageIndex: 0, mode: 'replace' })
  })

  it('fills empty page 1 even when later pages have content', () => {
    const store = makeStore({
      2: [{ type: 'rect' }],
    })
    expect(
      resolveStudioGeneratePlacement({
        store,
        interiorPageCount: 3,
      }),
    ).toEqual({ startPageIndex: 0, mode: 'replace' })
  })

  it('appends at the end of the book when page 1 already has content', () => {
    const store = makeStore({
      0: [studioObj('sudoku-1', 'single')],
      1: [studioObj('sudoku-1', 'answers')],
      2: [studioObj('sudoku-2', 'single')],
    })
    expect(
      resolveStudioGeneratePlacement({
        store,
        interiorPageCount: 3,
      }),
    ).toEqual({ startPageIndex: 3, mode: 'insert' })
  })
})

describe('countStudioPuzzleInstances / nextStudioGameTitle', () => {
  it('starts at Game 1 for an empty book', () => {
    const store = makeStore({})
    expect(countStudioPuzzleInstances(store, 0)).toBe(0)
    expect(nextStudioGameTitle(store, 0)).toBe('Game 1')
  })

  it('ignores answer-key pages when numbering games', () => {
    const store = makeStore({
      0: [studioObj('a', 'single')],
      1: [studioObj('a', 'answers')],
      2: [studioObj('b', 'single')],
      3: [studioObj('b', 'answers')],
    })
    expect(countStudioPuzzleInstances(store, 4)).toBe(2)
    expect(nextStudioGameTitle(store, 4)).toBe('Game 3')
  })

  it('counts a study+recall spread as one game', () => {
    const store = makeStore({
      0: [studioObj('spread', 'study')],
      1: [studioObj('spread', 'recall')],
      2: [studioObj('spread', 'answers')],
    })
    expect(countStudioPuzzleInstances(store, 3)).toBe(1)
    expect(nextStudioGameTitle(store, 3)).toBe('Game 2')
  })
})

describe('studioGameTitleAtPageIndex', () => {
  it('uses slot ordinal at the replace target (ignores answer keys)', () => {
    const store = makeStore({
      0: [studioObj('a', 'single')],
      1: [studioObj('a', 'answers')],
      2: [studioObj('b', 'single')],
      3: [studioObj('b', 'answers')],
    })
    expect(studioGameOrdinalAtPageIndex(store, 0)).toBe(1)
    expect(studioGameTitleAtPageIndex(store, 0)).toBe('Game 1')
    expect(studioGameOrdinalAtPageIndex(store, 2)).toBe(2)
    expect(studioGameTitleAtPageIndex(store, 2)).toBe('Game 2')
  })

  it('counts a study+recall spread as one game before later slots', () => {
    const store = makeStore({
      0: [studioObj('spread', 'study')],
      1: [studioObj('spread', 'recall')],
      2: [studioObj('next', 'single')],
    })
    expect(studioGameTitleAtPageIndex(store, 2)).toBe('Game 2')
  })
})

describe('bumpStudioGameTitle', () => {
  it('advances Game N and bare digits', () => {
    expect(bumpStudioGameTitle('Game 1')).toBe('Game 2')
    expect(bumpStudioGameTitle('3')).toBe('Game 4')
  })

  it('leaves custom titles alone', () => {
    expect(bumpStudioGameTitle('Sudoku Warmup')).toBeNull()
    expect(bumpStudioGameTitle('')).toBeNull()
  })
})

describe('formatStudioBulkTitleRange', () => {
  it('shows a single title or an inclusive range', () => {
    expect(formatStudioBulkTitleRange('Game 3', 1)).toBe('Game 3')
    expect(formatStudioBulkTitleRange('Game 3', 10)).toBe('Game 3 – Game 12')
  })
})

describe('toStudioSolutionTitle', () => {
  it('formats Game N as Solution Game N', () => {
    expect(toStudioSolutionTitle('Game 1')).toBe('Solution Game 1')
    expect(toStudioSolutionTitle('Game 12')).toBe('Solution Game 12')
  })

  it('is stable when already prefixed', () => {
    expect(toStudioSolutionTitle('Solution Game 3')).toBe('Solution Game 3')
  })

  it('prefixes custom titles', () => {
    expect(toStudioSolutionTitle('Sudoku Warmup')).toBe('Solution Sudoku Warmup')
  })
})
