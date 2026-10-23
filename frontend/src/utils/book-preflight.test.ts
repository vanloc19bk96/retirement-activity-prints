/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

import { bookLevelIssues, checkBook, describePages, isBlankPage, withImageStandIns } from './book-preflight'
import type { MarginGuide } from '@/types/canvas-settings.types'

import { buildInteriorPreflightSurface } from './kdp-preflight'

const filledPage = () => ({ objects: [{ type: 'Rect', left: 100, top: 100, width: 10, height: 10 }] })
/** A book of `count` ordinary, non-blank pages. */
const book = (count: number): Array<object | null> => Array.from({ length: count }, filledPage)

describe('bookLevelIssues', () => {
  it('passes a book long enough, without blank pages', () => {
    expect(bookLevelIssues(book(24))).toEqual([])
  })

  it('asks for the pages a paperback needs', () => {
    const [issue] = bookLevelIssues(book(20))
    expect(issue).toMatchObject({ id: 'too-few-pages', severity: 'error' })
    expect(issue.detail).toContain('Add 4 more')
  })

  it('lists the blank pages, a warning once they are many', () => {
    const pages = book(30)
    pages[4] = { objects: [] }
    pages[5] = null
    const issue = bookLevelIssues(pages).find(({ id }) => id === 'blank-pages')
    expect(issue).toMatchObject({ severity: 'info', pages: [4, 5] })
    for (let i = 10; i < 16; i += 1) pages[i] = { objects: [] }
    expect(bookLevelIssues(pages).find(({ id }) => id === 'blank-pages')?.severity).toBe('warning')
  })
})

describe('helpers', () => {
  it('reads a page of hidden objects as blank', () => {
    expect(isBlankPage({ objects: [{ type: 'Rect', visible: false }] })).toBe(true)
    expect(isBlankPage(filledPage())).toBe(false)
  })

  it('names pages for the reader', () => {
    expect(describePages([3])).toBe('page 4')
    expect(describePages([3, 8])).toBe('pages 4 and 9')
    expect(describePages([0, 1, 2, 3, 4])).toBe('pages 1, 2, 3 and 2 more')
  })

  it('swaps images, in groups too, for stand-ins of the same size that load nothing', () => {
    const page = {
      objects: [
        { type: 'Image', src: 'https://x/y.png', width: 400, height: 300, scaleX: 0.5, layerName: 'Photo' },
        { type: 'Group', objects: [{ type: 'image', src: 'z', width: 10, height: 10 }] },
      ],
    }
    const swapped = withImageStandIns(page) as { objects: Array<Record<string, unknown> & { objects?: Array<Record<string, unknown>> }> }
    expect(swapped.objects[0]).toMatchObject({ type: 'Rect', width: 400, height: 300, scaleX: 0.5, layerName: 'Photo', data: { preflightImage: true } })
    expect(swapped.objects[0].src).toBeUndefined()
    expect(swapped.objects[1].objects?.[0]).toMatchObject({ type: 'Rect', layerName: 'Image' })
    expect(page.objects[0].type).toBe('Image')
  })
})

describe('checkBook', () => {
  const marginGuide: MarginGuide = {
    topPixels: 36,
    bottomPixels: 36,
    insidePixels: 36,
    outsidePixels: 36,
    bleedTopPixels: 0,
    bleedBottomPixels: 0,
    bleedOutsidePixels: 0,
  }
  const surfaceFor = (index: number) =>
    buildInteriorPreflightSurface({ width: 600, height: 900, marginGuide, isLeftPage: index % 2 === 1, hasBleed: false })

  it('checks every page against its own surface and reports the pages with problems', async () => {
    const pages = book(24)
    // Off the page entirely, and an image printed far below 150 DPI.
    pages[3] = { objects: [{ type: 'Rect', left: 2000, top: 2000, width: 10, height: 10 }] }
    pages[7] = { objects: [{ type: 'Image', src: 'x', left: 100, top: 100, width: 100, height: 100, scaleX: 4, scaleY: 4 }] }
    const progress: number[] = []
    const report = await checkBook(pages, surfaceFor, { onProgress: (checked) => progress.push(checked) })
    expect(report.pageCount).toBe(24)
    expect(report.bookIssues).toEqual([])
    expect(report.pages.map(({ index }) => index)).toEqual([3, 7])
    expect(report.pages[0].issues[0].ruleId).toBe('off-page')
    expect(report.pages[1].issues.map(({ ruleId }) => ruleId)).toContain('low-resolution')
    expect(progress.at(-1)).toBe(24)
  })

  it('stops when asked', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(checkBook(book(3), surfaceFor, { signal: controller.signal })).rejects.toThrow('stopped')
  })
})
