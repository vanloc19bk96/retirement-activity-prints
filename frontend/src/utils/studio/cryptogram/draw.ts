import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { encodeLetter, SLOT_WIDTH_EM } from './cipher'
import {
  CRYPTOGRAM_BAND_GUTTER,
  CRYPTOGRAM_INDEX_W,
  layoutCryptogram,
  lineWidth,
  type CryptogramLayout,
} from './layout'

export interface CryptogramPuzzle {
  /** Uppercase A–Z with single spaces. */
  plain: string
  cipher: ReadonlyMap<string, string>
}

export interface CryptogramDrawOptions {
  field: Box
  puzzles: CryptogramPuzzle[]
  font: string
  codeFont: string
  tag: StudioTag
  minFont: number
  maxFont: number
}

const RULE_RATIO = 0.8

interface SlotOptions {
  centerX: number
  lineTop: number
  layout: CryptogramLayout
  letter: string
  puzzle: CryptogramPuzzle
  codeFont: string
  tag: StudioTag
  minFont: number
}

function drawSlot(objects: StudioFabricObject[], options: SlotOptions): void {
  const { centerX, lineTop, layout, letter, puzzle, codeFont, tag, minFont } = options
  const { fontSize, slotW, lineH } = layout
  const ruleW = slotW * RULE_RATIO

  objects.push(
    buildRect(
      {
        left: Math.round(centerX - ruleW / 2),
        top: Math.round(lineTop + lineH * 0.46),
        width: Math.round(ruleW),
        height: 1,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )

  const code = encodeLetter(letter, puzzle.cipher)
  const codeSize = fitFontSizeToWidth(code, slotW, fontSize, minFont)
  objects.push(
    buildText(
      {
        left: centerX,
        top: lineTop + lineH * 0.72,
        text: code,
        width: estimateTextBoxWidth(code, codeSize, slotW),
        fontFamily: codeFont,
        fontSize: codeSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  objects.push(
    buildText(
      {
        left: centerX,
        top: lineTop + lineH * 0.26,
        text: letter,
        width: estimateTextBoxWidth(letter, fontSize, slotW),
        fontFamily: codeFont,
        fontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'answer',
    ),
  )
}

function drawPuzzleLines(
  objects: StudioFabricObject[],
  options: {
    content: Box
    blockTop: number
    layout: CryptogramLayout
    puzzle: CryptogramPuzzle
    codeFont: string
    tag: StudioTag
    minFont: number
  },
): void {
  const { content, blockTop, layout, puzzle, codeFont, tag, minFont } = options
  layout.lines.forEach((words, row) => {
    const width = lineWidth({ words, slotW: layout.slotW, wordGap: layout.wordGap })
    const lineTop = blockTop + row * layout.lineH
    let cursor = content.left + Math.max(0, (content.width - width) / 2)
    for (const word of words) {
      for (const letter of word) {
        drawSlot(objects, {
          centerX: cursor + layout.slotW / 2,
          lineTop,
          layout,
          letter,
          puzzle,
          codeFont,
          tag,
          minFont,
        })
        cursor += layout.slotW
      }
      cursor += layout.wordGap
    }
  })
}

function buildPuzzleGroup(options: {
  puzzle: CryptogramPuzzle
  index: number
  field: Box
  bandHeight: number
  font: string
  codeFont: string
  tag: StudioTag
  minFont: number
  maxFont: number
}): StudioFabricObject | null {
  const { puzzle, index, field, bandHeight, font, codeFont, tag, minFont, maxFont } =
    options
  const content: Box = {
    left: field.left + CRYPTOGRAM_INDEX_W,
    top: field.top,
    width: field.width - CRYPTOGRAM_INDEX_W,
    height: bandHeight,
  }
  const layout = layoutCryptogram({
    words: puzzle.plain.split(' ').filter(Boolean),
    bandWidth: content.width,
    bandHeight: content.height,
    slotEm: SLOT_WIDTH_EM,
    minFont,
    maxFont,
  })
  if (!layout) return null

  const parts: StudioFabricObject[] = []
  const blockTop = field.top
  const label = `${index + 1})`
  const labelSize = Math.max(minFont, Math.min(layout.fontSize, CRYPTOGRAM_INDEX_W * 0.55))
  parts.push(
    buildText(
      {
        left: field.left,
        top: blockTop + layout.lineH * 0.4,
        text: label,
        width: estimateTextBoxWidth(label, labelSize, CRYPTOGRAM_INDEX_W),
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )
  drawPuzzleLines(parts, { content, blockTop, layout, puzzle, codeFont, tag, minFont })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

export function drawCryptograms(
  objects: StudioFabricObject[],
  options: CryptogramDrawOptions,
): number[] {
  const { field, puzzles, font, codeFont, tag, minFont, maxFont } = options
  if (puzzles.length === 0) return []

  const gutters = CRYPTOGRAM_BAND_GUTTER * Math.max(0, puzzles.length - 1)
  const bandHeight = Math.max(minFont * 4, (field.height - gutters) / puzzles.length)

  const groups = puzzles
    .map((puzzle, i) =>
      buildPuzzleGroup({
        puzzle,
        index: i,
        field,
        bandHeight,
        font,
        codeFont,
        tag,
        minFont,
        maxFont,
      }),
    )
    .filter((g): g is StudioFabricObject => g != null)

  if (groups.length === 0) return []

  const stackH =
    groups.reduce((sum, g) => sum + (g.height ?? 0), 0) +
    CRYPTOGRAM_BAND_GUTTER * Math.max(0, groups.length - 1)
  let cursorTop = field.top + Math.max(0, (field.height - stackH) / 2)
  const fontSizes: number[] = []

  for (const group of groups) {
    const width = group.width ?? 0
    const height = group.height ?? 0
    const targetLeft = Math.round(field.left + Math.max(0, (field.width - width) / 2))
    const targetTop = Math.round(cursorTop)
    objects.push({
      ...group,
      left: targetLeft,
      top: targetTop,
    })
    cursorTop = targetTop + height + CRYPTOGRAM_BAND_GUTTER
    const answer = (group.objects ?? []).find((o) => o.studioRole === 'answer')
    if (typeof answer?.fontSize === 'number') fontSizes.push(answer.fontSize)
  }

  return fontSizes
}
