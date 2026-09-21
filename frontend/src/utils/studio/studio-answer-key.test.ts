import { describe, expect, it } from 'vitest'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_INSTRUCTION_SIZE,
  STUDIO_TITLE_SIZE,
} from '@/constants/studio.constants'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildAnswerPage } from './studio-answer-key'
import { contentBox, drawHeader, objectExtent } from './studio-layout'

function titleObj(text: string): StudioFabricObject {
  return {
    type: 'textbox',
    left: 0,
    top: 0,
    text,
    fontSize: STUDIO_TITLE_SIZE,
    fontWeight: 700,
    studioRole: 'decoration',
    width: 120,
  }
}

describe('buildAnswerPage title', () => {
  it('rewrites Game N to Solution Game N', () => {
    const page = buildAnswerPage(
      [
        titleObj('Game 2'),
        {
          type: 'textbox',
          left: 0,
          top: 0,
          text: '4',
          studioRole: 'answer',
          visible: false,
        },
      ],
      STUDIO_ANSWER_INK,
    )
    const title = page.find((o) => o.studioRole === 'decoration')
    expect(String(title?.text ?? '').replace(/\u00a0/g, ' ')).toBe('Solution Game 2')
    expect(String(title?.text ?? '').includes('\u00a0')).toBe(true)
    expect(title?.studioPageRole).toBe('answers')
    expect(Number(title?.width)).toBeGreaterThan(120)
  })
})

describe('buildAnswerPage phosphor icons', () => {
  it('keeps duotone fill/outline instead of flattening to answer ink', () => {
    const page = buildAnswerPage(
      [
        titleObj('Game 1'),
        {
          type: 'group',
          left: 10,
          top: 20,
          width: 24,
          height: 24,
          studioRole: 'answer',
          visible: false,
          data: { source: 'phosphor-icon', iconName: 'circle' },
          objects: [
            {
              type: 'path',
              left: 0,
              top: 0,
              fill: '#D6D6D6',
              stroke: undefined,
              visible: false,
            },
            {
              type: 'path',
              left: 0,
              top: 0,
              fill: '#4B4B4B',
              stroke: undefined,
              visible: false,
            },
          ],
        },
      ],
      STUDIO_ANSWER_INK,
    )
    const icon = page.find((o) => o.data?.source === 'phosphor-icon')
    expect(icon?.visible).toBe(true)
    expect(icon?.studioPageRole).toBe('answers')
    const fills = (icon?.objects ?? []).map((c) => c.fill)
    expect(fills).toEqual(['#D6D6D6', '#4B4B4B'])
  })
})

describe('buildAnswerPage omits how-to copy', () => {
  it('drops header instructions and Example lines', () => {
    const page = buildAnswerPage(
      [
        titleObj('Game 1'),
        {
          type: 'textbox',
          left: 0,
          top: 0,
          text: 'Look at the shape on the left, then circle SAME or MIRROR.',
          fontSize: STUDIO_INSTRUCTION_SIZE,
          studioRole: 'decoration',
        },
        {
          type: 'textbox',
          left: 0,
          top: 0,
          text: 'Example: same shape turned around → SAME   |   flipped over → MIRROR',
          fontSize: 16,
          studioRole: 'decoration',
        },
        {
          type: 'textbox',
          left: 0,
          top: 0,
          text: '1)',
          fontSize: 18,
          studioRole: 'decoration',
        },
        {
          type: 'circle',
          left: 0,
          top: 0,
          studioRole: 'answer',
          visible: false,
        },
      ],
      STUDIO_ANSWER_INK,
    )
    const texts = page.map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
    expect(texts).toContain('Solution Game 1')
    expect(texts).toContain('1)')
    expect(texts.some((t) => t.includes('Look at the shape'))).toBe(false)
    expect(texts.some((t) => /^Example\s*:/i.test(t))).toBe(false)
  })
})

/** Real KDP trims: the narrowest column is where a re-titled key overflows. */
const TRIMS: Array<[string, StudioGenerateContext]> = [
  [
    '5 x 8',
    {
      pageWidth: 360,
      pageHeight: 576,
      margin: { top: 54, right: 43, bottom: 54, left: 65 },
      seed: 1,
      instanceId: 'trim',
    },
  ],
  [
    '5.5 x 8.5',
    {
      pageWidth: 396,
      pageHeight: 612,
      margin: { top: 54, right: 43, bottom: 54, left: 65 },
      seed: 1,
      instanceId: 'trim',
    },
  ],
  [
    '6 x 9',
    {
      pageWidth: 432,
      pageHeight: 648,
      margin: { top: 54, right: 43, bottom: 54, left: 65 },
      seed: 1,
      instanceId: 'trim',
    },
  ],
  [
    '8.5 x 11',
    {
      pageWidth: 612,
      pageHeight: 792,
      margin: { top: 36, right: 36, bottom: 36, left: 48 },
      seed: 1,
      instanceId: 'trim',
    },
  ],
]

const TAG = {
  templateKey: 'sudoku',
  instanceId: 'trim',
  pageRole: 'single',
} as const

function headerTitleObject(ctx: StudioGenerateContext, title: string): StudioFabricObject {
  const { objects } = drawHeader(
    contentBox(ctx),
    { showTitle: true, title, showInstructions: false },
    TAG,
    '',
  )
  return objects[0]!
}

describe('buildAnswerPage title fits the content column', () => {
  for (const [trim, ctx] of TRIMS) {
    const column = contentBox(ctx)
    for (const title of ['Game 1', 'Game 12', 'Game 100', 'Memory Grid Challenge']) {
      it(`${trim}: "${title}" stays inside the safe area`, () => {
        const puzzleTitle = headerTitleObject(ctx, title)
        const [keyTitle] = buildAnswerPage([puzzleTitle], STUDIO_ANSWER_INK_MONO, {
          contentWidth: column.width,
        })

        expect(String(keyTitle?.text ?? '').replace(/\u00a0/g, ' ')).toMatch(/^Solution /)
        const extent = objectExtent(keyTitle!)
        expect(extent.left).toBeGreaterThanOrEqual(column.left)
        expect(extent.right).toBeLessThanOrEqual(column.left + column.width)
      })
    }
  }

  it('keeps full title size when the column has room', () => {
    const ctx = TRIMS[3]![1]
    const puzzleTitle = headerTitleObject(ctx, 'Game 12')
    const [keyTitle] = buildAnswerPage([puzzleTitle], STUDIO_ANSWER_INK_MONO, {
      contentWidth: contentBox(ctx).width,
    })
    expect(keyTitle?.fontSize).toBe(STUDIO_TITLE_SIZE)
  })

  it('re-titles a heading that drawHeader already fitted below title size', () => {
    const ctx = TRIMS[0]![1]
    const puzzleTitle = headerTitleObject(ctx, 'Memory Grid Challenge')
    // Narrow trim: the puzzle heading is already shrunk, so the size check alone
    // would skip it and print the key with the puzzle's own title.
    expect(Number(puzzleTitle.fontSize)).toBeLessThan(STUDIO_TITLE_SIZE)
    const [keyTitle] = buildAnswerPage([puzzleTitle], STUDIO_ANSWER_INK_MONO, {
      contentWidth: contentBox(ctx).width,
    })
    expect(String(keyTitle?.text ?? '').replace(/\u00a0/g, ' ')).toBe(
      'Solution Memory Grid Challenge',
    )
  })

  it('falls back to the page bounds when no column width is passed', () => {
    const ctx = TRIMS[0]![1]
    const column = contentBox(ctx)
    const puzzleTitle = headerTitleObject(ctx, 'Game 12')
    const grid: StudioFabricObject = {
      type: 'rect',
      left: column.left,
      top: column.top + 100,
      width: column.width,
      height: 200,
      studioRole: 'structure',
    }
    const page = buildAnswerPage([puzzleTitle, grid], STUDIO_ANSWER_INK_MONO)
    const extent = objectExtent(page[0]!)
    expect(extent.left).toBeGreaterThanOrEqual(column.left)
    expect(extent.right).toBeLessThanOrEqual(column.left + column.width)
  })
})
