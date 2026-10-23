/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'

import {
  changedPagesLayout,
  duplicatePageJson,
  duplicatePageLayout,
  pageBackgroundColor,
  pagesInScope,
  repeatGroupOf,
  taggedRepeatObjects,
  withoutRepeatedObjects,
  withPageBackground,
  withRepeatedObjects,
} from './page-design'

const SIZE = { width: 600, height: 900 }

const text = (value: string, data?: Record<string, unknown>) => ({ type: 'Textbox', text: value, ...(data ? { data } : {}) })

const texts = (page: object | null): string[] =>
  ((page as { objects?: Array<{ text?: string }> } | null)?.objects ?? []).map((obj) => obj.text ?? `<${String((obj as { type?: string }).type)}>`)

describe('pagesInScope', () => {
  it('takes the open page, every page, or odd and even page numbers', () => {
    expect(pagesInScope('this', 5, 2)).toEqual([2])
    expect(pagesInScope('all', 5, 2)).toEqual([0, 1, 2, 3, 4])
    expect(pagesInScope('odd', 5, 2)).toEqual([0, 2, 4])
    expect(pagesInScope('even', 5, 2)).toEqual([1, 3])
    expect(pagesInScope('this', 2, 5)).toEqual([])
  })
})

describe('duplicatePageJson', () => {
  it('shares no object with the page it copies', () => {
    const page = { objects: [text('a', { note: 'n' })] }
    const copy = duplicatePageJson(page) as { objects: Array<{ text: string }> }
    copy.objects[0].text = 'changed'
    expect(page.objects[0].text).toBe('a')
  })

  it('copies a page never loaded as an empty page', () => {
    expect(duplicatePageJson(null)).toEqual({ objects: [] })
  })
})

describe('duplicatePageLayout', () => {
  it('puts the copy right after the page, every page kept', () => {
    const pages = [{ objects: [text('a')] }, { objects: [text('b')] }, null]
    const layout = duplicatePageLayout(pages, 1)
    expect(layout.map((page) => page.from)).toEqual([0, 1, undefined, 2])
    expect(texts(layout[2].json ?? null)).toEqual(['b'])
  })
})

describe('page background', () => {
  it('goes under everything, covers the page, and cannot be picked', () => {
    const page = withPageBackground({ objects: [text('a')] }, '#112233', SIZE)
    const [background, rest] = (page as { objects: Array<Record<string, unknown>> }).objects
    expect(pageBackgroundColor(page)).toBe('#112233')
    expect(background).toMatchObject({ left: 0, top: 0, width: 600, height: 900, selectable: false, hasControls: false, layerName: 'Page background' })
    expect(rest.text).toBe('a')
  })

  it('replaces the colour it had and comes off again', () => {
    const red = withPageBackground({ objects: [text('a')] }, '#ff0000', SIZE)
    const blue = withPageBackground(red, '#0000ff', SIZE)
    expect(texts(blue)).toEqual(['<Rect>', 'a'])
    expect(pageBackgroundColor(blue)).toBe('#0000ff')
    const none = withPageBackground(blue, null, SIZE)
    expect(texts(none)).toEqual(['a'])
    expect(pageBackgroundColor(none)).toBeNull()
  })

  it('gives a page never loaded a background', () => {
    expect(pageBackgroundColor(withPageBackground(null, '#abcdef', SIZE))).toBe('#abcdef')
  })
})

describe('repeated objects', () => {
  const border = taggedRepeatObjects([{ type: 'Rect', left: 10 }], 'g1')

  it('tags the copies with their group', () => {
    expect(repeatGroupOf(border[0] as { data?: unknown })).toBe('g1')
    expect(repeatGroupOf({ data: { other: 1 } })).toBeNull()
  })

  it('go on top of a page, and replace their old copies where they were', () => {
    const page = withRepeatedObjects({ objects: [text('a'), text('b')] }, 'g1', border)
    expect(texts(page)).toEqual(['a', 'b', '<Rect>'])
    const moved = { objects: [text('a'), ...(page as { objects: object[] }).objects.slice(2), text('b')] }
    const updated = withRepeatedObjects(moved, 'g1', taggedRepeatObjects([{ type: 'Rect', left: 99 }], 'g1')) as {
      objects: Array<{ left?: number; text?: string }>
    }
    expect(texts(updated)).toEqual(['a', '<Rect>', 'b'])
    expect(updated.objects[1].left).toBe(99)
  })

  it('come off every page, leaving pages without them as they are', () => {
    const plain = { objects: [text('a')] }
    const withBorder = withRepeatedObjects(plain, 'g1', border)
    const otherGroup = withRepeatedObjects(plain, 'g2', taggedRepeatObjects([{ type: 'Rect' }], 'g2'))
    expect(texts(withoutRepeatedObjects(withBorder, 'g1'))).toEqual(['a'])
    expect(withoutRepeatedObjects(plain, 'g1')).toBe(plain)
    expect(texts(withoutRepeatedObjects(otherGroup, 'g1'))).toEqual(['a', '<Rect>'])
  })
})

describe('changedPagesLayout', () => {
  it('changes only the pages asked for, and counts the ones it changed', () => {
    const pages = [{ objects: [] }, { objects: [] }, { objects: [] }]
    const { layout, changed } = changedPagesLayout(pages, [0, 2], (page, index) => (index === 2 ? page : { objects: [text('x')] }))
    expect(changed).toBe(1)
    expect(layout).toEqual([{ from: 0, json: { objects: [text('x')] } }, { from: 1 }, { from: 2 }])
  })
})
