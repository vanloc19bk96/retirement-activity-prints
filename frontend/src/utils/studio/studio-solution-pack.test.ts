import { describe, expect, it } from 'vitest'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import type { SolutionsPerPage } from '@/types/canvas-settings.types'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { objectExtent } from './studio-object-bounds'
import type { StudioSolutionPlacement } from './studio-solution-placement'
import {
  resolveStudioPageDeletion,
  resolveStudioSolutionLayout,
  type StudioSolutionLayoutPage,
} from './studio-solution-pack'

type PageJson = { objects: Array<Record<string, unknown>> }
type Role = 'single' | 'study' | 'recall' | 'answers'

const PAGE_WIDTH = 816
const PAGE_HEIGHT = 1056

/** Recto (even index) has the gutter on the left. */
const marginFor = (pageIndex: number) =>
  pageIndex % 2 === 0
    ? { left: 70, right: 50, top: 40, bottom: 40 }
    : { left: 50, right: 70, top: 40, bottom: 40 }

/** A full-width sheet laid out on its own page's side, like a generator writes it. */
function sheet(instanceId: string, role: Role, pageIndex: number): PageJson {
  const left = marginFor(pageIndex).left
  return {
    objects: [
      { type: 'textbox', left, top: 40, width: 696, height: 30, fontSize: 24, text: instanceId, studioInstanceId: instanceId, studioPageRole: role },
      { type: 'rect', left, top: 90, width: 696, height: 900, studioInstanceId: instanceId, studioPageRole: role },
    ],
  }
}

function storeOf(pages: PageJson[]): CanvasStateStore {
  return { getSerialized: (index: number) => pages[index] ?? null } as unknown as CanvasStateStore
}

function layout(
  pages: PageJson[],
  placement: StudioSolutionPlacement,
  perPage: SolutionsPerPage,
): StudioSolutionLayoutPage[] | null {
  return resolveStudioSolutionLayout({
    store: storeOf(pages),
    pageCount: pages.length,
    placement,
    perPage,
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
    marginFor,
  })
}

/** What the editor's store holds once a layout is applied. */
function apply(pages: PageJson[], next: StudioSolutionLayoutPage[] | null): PageJson[] {
  if (!next) return pages
  return next.map((page) => (page.json as PageJson | undefined) ?? pages[page.from!]!)
}

const instancesOn = (page: PageJson): string[] => [
  ...new Set(page.objects.map((obj) => String(obj.studioInstanceId))),
]

/** G1 S1 G2 S2 G3 S3, keys after their games. */
function threeGames(): PageJson[] {
  return [
    sheet('a', 'single', 0),
    sheet('a', 'answers', 1),
    sheet('b', 'single', 2),
    sheet('b', 'answers', 3),
    sheet('c', 'single', 4),
    sheet('c', 'answers', 5),
  ]
}

describe('resolveStudioSolutionLayout — packing', () => {
  it('puts two keys on each solution page at the end, in game order', () => {
    const book = threeGames()
    const next = layout(book, 'end', 2)!
    const pages = apply(book, next)

    expect(pages.map(instancesOn)).toEqual([['a'], ['b'], ['c'], ['a', 'b'], ['c']])
    // Games keep their rows; packed pages are new.
    expect(next.slice(0, 3).map((page) => page.from)).toEqual([0, 2, 4])
    expect(next.slice(3).map((page) => page.from)).toEqual([null, null])
  })

  it('scales each key into its own cell inside the safe area', () => {
    const pages = apply(threeGames(), layout(threeGames(), 'end', 4))
    const packed = pages[3]!
    expect(instancesOn(packed)).toEqual(['a', 'b', 'c'])

    const margin = marginFor(3)
    for (const obj of packed.objects) {
      const scale = obj.scaleX as number
      expect(scale).toBeGreaterThan(0)
      expect(scale).toBeLessThan(0.5)
      expect(obj.left as number).toBeGreaterThanOrEqual(margin.left - 0.001)
      expect((obj.left as number) + (obj.width as number) * scale).toBeLessThanOrEqual(
        PAGE_WIDTH - margin.right + 0.001,
      )
      expect((obj.top as number) + (obj.height as number) * scale).toBeLessThanOrEqual(
        PAGE_HEIGHT - margin.bottom + 0.001,
      )
    }
    const rectLeft = (id: string) =>
      packed.objects.find((obj) => obj.type === 'rect' && obj.studioInstanceId === id)!.left as number
    // 2 x 2: a and c share the left column, b sits to the right.
    expect(rectLeft('a')).toBeCloseTo(rectLeft('c'))
    expect(rectLeft('b')).toBeGreaterThan(rectLeft('a'))
  })

  it('pulls the answer up under its heading, and back down when unpacked', () => {
    // An answer page keeps the grid where the puzzle had it, below the dropped how-to line.
    const gappy = (instanceId: string, role: Role, pageIndex: number): PageJson => {
      const page = sheet(instanceId, role, pageIndex)
      page.objects[0]!.data = { studioHeader: 'title' }
      page.objects[1] = { ...page.objects[1], top: 300, height: 600 }
      return page
    }
    const book = [gappy('a', 'single', 0), gappy('a', 'answers', 1)]
    book[0]!.objects[0]!.data = undefined
    const packed = apply(book, layout(book, 'end', 2))
    const [title, grid] = packed[1]!.objects
    const scale = grid!.scaleY as number
    const fullTitle = book[1]!.objects[0] as unknown as StudioFabricObject
    const titleHeight = objectExtent(fullTitle).bottom - fullTitle.top
    const titleBottom = (title!.top as number) + titleHeight * scale
    // 24px at full size, scaled down with the key.
    expect((grid!.top as number) - titleBottom).toBeCloseTo(24 * scale, 3)

    const single = apply(packed, layout(packed, 'end', 1))
    expect(single[1]!.objects[1]!.top).toBeCloseTo(300, 5)
    expect(single[1]!.objects[0]!.top).toBeCloseTo(40, 5)
  })

  it('is already arranged once packed', () => {
    const pages = apply(threeGames(), layout(threeGames(), 'end', 2))
    expect(layout(pages, 'end', 2)).toBeNull()
  })

  it('keeps a full packed page untouched when a new game joins the book', () => {
    const packed = apply(threeGames(), layout(threeGames(), 'end', 2))
    // G1 G2 G3 [S1 S2] [S3] | G4 S4 just generated at the end.
    const book = [...packed, sheet('d', 'single', 5), sheet('d', 'answers', 6)]
    const next = layout(book, 'end', 2)!
    const pages = apply(book, next)

    expect(pages.map(instancesOn)).toEqual([['a'], ['b'], ['c'], ['d'], ['a', 'b'], ['c', 'd']])
    // [S1 S2] moved from index 3 to 4 (verso -> recto) but kept its row.
    expect(next[4]!.from).toBe(3)
    expect(next[5]!.from).toBeNull()
  })

  it('repacks when the count per page changes', () => {
    const two = apply(threeGames(), layout(threeGames(), 'end', 2))
    const four = apply(two, layout(two, 'end', 4))
    expect(four.map(instancesOn)).toEqual([['a'], ['b'], ['c'], ['a', 'b', 'c']])
  })
})

describe('resolveStudioSolutionLayout — unpacking', () => {
  it('gives each key its full-size page back at one per page', () => {
    const original = threeGames()
    const packed = apply(original, layout(original, 'end', 4))
    const single = apply(packed, layout(packed, 'end', 1))

    expect(single.map(instancesOn)).toEqual([['a'], ['b'], ['c'], ['a'], ['b'], ['c']])
    // Key "a" now sits on index 3 (verso), so it lines up with the verso margin.
    const expected = sheet('a', 'answers', 3).objects
    single[3]!.objects.forEach((obj, i) => {
      expect(obj.left).toBeCloseTo(expected[i]!.left as number, 5)
      expect(obj.top).toBeCloseTo(expected[i]!.top as number, 5)
      expect(obj.scaleX).toBeCloseTo(1, 6)
      expect(obj.scaleY).toBeCloseTo(1, 6)
      expect(obj.data).toBeUndefined()
    })
  })

  it('puts packed keys back after their games when solutions leave the end', () => {
    const original = threeGames()
    const packed = apply(original, layout(original, 'end', 2))
    const back = apply(packed, layout(packed, 'after-game', 2))

    expect(back.map(instancesOn)).toEqual([['a'], ['a'], ['b'], ['b'], ['c'], ['c']])
    back.forEach((page, pageIndex) => {
      page.objects.forEach((obj, i) => {
        expect(obj.left).toBeCloseTo(original[pageIndex]!.objects[i]!.left as number, 5)
        expect(obj.top).toBeCloseTo(original[pageIndex]!.objects[i]!.top as number, 5)
      })
    })
  })

  it('carries objects the seller added to a packed page along with its first key', () => {
    const packed = apply(threeGames(), layout(threeGames(), 'end', 2))
    packed[3]!.objects.push({ type: 'rect', left: 100, top: 100, width: 10, height: 10 })
    const single = apply(packed, layout(packed, 'end', 1))
    expect(single).toHaveLength(6)
    expect(single[3]!.objects).toHaveLength(3)
    expect(single[4]!.objects).toHaveLength(2)
  })
})

describe('resolveStudioSolutionLayout — no packing', () => {
  it('falls back to the plain reorder', () => {
    const next = layout(threeGames(), 'end', 1)!
    expect(next.map((page) => page.from)).toEqual([0, 2, 4, 1, 3, 5])
  })

  it('ignores the count per page while keys follow their games', () => {
    expect(layout(threeGames(), 'after-game', 4)).toBeNull()
  })
})

function deletePage(
  pages: PageJson[],
  deletedPageIndex: number,
  placement: StudioSolutionPlacement,
  perPage: SolutionsPerPage,
): StudioSolutionLayoutPage[] | null {
  return resolveStudioPageDeletion({
    store: storeOf(pages),
    pageCount: pages.length,
    deletedPageIndex,
    placement,
    perPage,
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
    marginFor,
  })
}

describe('resolveStudioPageDeletion', () => {
  it('drops the key page that follows its game', () => {
    const book = threeGames()
    const next = deletePage(book, 2, 'after-game', 1)!
    expect(next.map((page) => page.from)).toEqual([0, 1, 4, 5])
    expect(next.every((page) => page.json === undefined)).toBe(true)
  })

  it('drops the key page at the end of the book', () => {
    const book = apply(threeGames(), layout(threeGames(), 'end', 1))
    // G1 G2 G3 S1 S2 S3
    const next = deletePage(book, 0, 'end', 1)!
    expect(apply(book, next).map(instancesOn)).toEqual([['b'], ['c'], ['b'], ['c']])
  })

  it('takes a packed key off its page and closes the gap', () => {
    const book = apply(threeGames(), layout(threeGames(), 'end', 4))
    // G1 G2 G3 [S1 S2 S3]
    const pages = apply(book, deletePage(book, 1, 'end', 4)!)
    expect(pages.map(instancesOn)).toEqual([['a'], ['c'], ['a', 'c']])
    const slots = pages[2]!.objects.map(
      (obj) => (obj.data as { studioSolutionPack: { slot: number } }).studioSolutionPack.slot,
    )
    expect([...new Set(slots)]).toEqual([0, 1])
  })

  it('pulls later keys forward onto the page that lost one', () => {
    const book = apply(threeGames(), layout(threeGames(), 'end', 2))
    // G1 G2 G3 [S1 S2] [S3]
    const pages = apply(book, deletePage(book, 0, 'end', 2)!)
    expect(pages.map(instancesOn)).toEqual([['b'], ['c'], ['b', 'c']])
  })

  it('drops a packed page left without keys', () => {
    const book = apply(threeGames(), layout(threeGames(), 'end', 2))
    const next = deletePage(book, 2, 'end', 2)!
    expect(apply(book, next).map(instancesOn)).toEqual([['a'], ['b'], ['a', 'b']])
    // [S1 S2] is untouched.
    expect(next[2]!.json).toBeUndefined()
  })

  it('keeps the key while the game still has a page', () => {
    const book = [sheet('a', 'study', 0), sheet('a', 'recall', 1), sheet('a', 'answers', 2)]
    expect(deletePage(book, 0, 'after-game', 1)).toBeNull()
  })

  it('leaves plain pages and key pages to the ordinary delete', () => {
    const book = [...threeGames(), { objects: [] }]
    expect(deletePage(book, 6, 'after-game', 1)).toBeNull()
    expect(deletePage(book, 1, 'after-game', 1)).toBeNull()
  })

  it('can empty the book', () => {
    const book = [sheet('a', 'single', 0), sheet('a', 'answers', 1)]
    expect(deletePage(book, 0, 'after-game', 1)).toEqual([])
  })
})
