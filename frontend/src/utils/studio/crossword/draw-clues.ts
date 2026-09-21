import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  estimateTextBoxWidth,
  splitLeft,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import type { CrosswordEntry } from './types'

const COL_GUTTER = 24
const CLUE_LINE_HEIGHT = 1.2
const CLUE_BLOCK_GAP = 6
/**
 * Fabric Textbox paints taller than `fontSize` (metrics / line box). Group
 * bounds that assume height === fontSize clip descenders (g, p, j, y).
 */
const CLUE_TEXT_HEIGHT_RATIO = 1.35
const CLUE_GROUP_PAD = 4

function clueBoxHeight(lines: number, fontSize: number): number {
  return Math.ceil(lines * fontSize * CLUE_TEXT_HEIGHT_RATIO)
}

function formatClueLine(entry: CrosswordEntry): string {
  const base = entry.clue.replace(/\s*\(\d+\s*letters?\)\s*$/i, '').trim()
  return `${entry.number}. ${base}`
}

function estimateWrappedLines(text: string, fontSize: number, maxWidth: number): number {
  const natural = estimateTextBoxWidth(text, fontSize, Number.POSITIVE_INFINITY)
  if (natural <= maxWidth) return 1
  return Math.max(1, Math.ceil(natural / Math.max(1, maxWidth)))
}

function blockHeight(lines: number, fontSize: number): number {
  return clueBoxHeight(lines, fontSize) + CLUE_BLOCK_GAP
}

function maxClueWidth(entries: CrosswordEntry[], fontSize: number, maxWidth: number): number {
  let max = 0
  for (const entry of entries) {
    max = Math.max(
      max,
      estimateTextBoxWidth(formatClueLine(entry), fontSize, maxWidth),
    )
  }
  return max
}

function fitClueFontSize(
  across: CrosswordEntry[],
  down: CrosswordEntry[],
  colWidth: number,
  listHeight: number,
): number {
  if (listHeight < 16) return 10
  const all = [...across, ...down]
  if (all.length === 0) return 12

  for (let fontSize = Math.min(16, STUDIO_BODY_SIZE - 8); fontSize >= 8; fontSize -= 1) {
    const acrossFits = columnFits(across, fontSize, colWidth, listHeight)
    const downFits = columnFits(down, fontSize, colWidth, listHeight)
    if (acrossFits && downFits) return fontSize
  }
  return 8
}

function columnFits(
  entries: CrosswordEntry[],
  fontSize: number,
  colWidth: number,
  listHeight: number,
): boolean {
  let used = 0
  for (const entry of entries) {
    const line = formatClueLine(entry)
    const lines = estimateWrappedLines(line, fontSize, colWidth)
    used += blockHeight(lines, fontSize)
    if (used > listHeight) return false
  }
  return true
}

function drawClueColumn(
  title: string,
  entries: CrosswordEntry[],
  area: Box,
  font: string,
  fontSize: number,
  tag: StudioTag,
): StudioFabricObject | null {
  if (area.height < 20 || area.width < 40) return null

  const objects: StudioFabricObject[] = []
  const titleSize = Math.max(14, STUDIO_BODY_SIZE - 6)
  objects.push(
    buildText(
      {
        left: area.left,
        top: area.top,
        text: title,
        fontFamily: font,
        fontSize: titleSize,
        fontWeight: 'bold',
        width: estimateTextBoxWidth(title, titleSize, area.width),
        textAlign: 'left',
        originX: 'left',
        lineHeight: 1,
      },
      tag,
      'decoration',
    ),
  )

  const listTop = area.top + titleSize + 8
  const listBottom = area.top + area.height - CLUE_GROUP_PAD
  if (entries.length === 0 || listBottom - listTop < 12) {
    return groupClueColumn(objects, tag)
  }

  let top = listTop
  const available = Math.max(0, listBottom - listTop)
  // Compress gaps when the column is over budget so we never drop a clue.
  let gap = CLUE_BLOCK_GAP
  let usedAtGap = 0
  for (const entry of entries) {
    const lines = estimateWrappedLines(formatClueLine(entry), fontSize, area.width)
    usedAtGap += clueBoxHeight(lines, fontSize) + gap
  }
  usedAtGap -= gap
  if (usedAtGap > available && entries.length > 1) {
    const heights = entries.map((entry) =>
      clueBoxHeight(
        estimateWrappedLines(formatClueLine(entry), fontSize, area.width),
        fontSize,
      ),
    )
    const heightSum = heights.reduce((s, h) => s + h, 0)
    const leftover = available - heightSum
    gap = Math.max(0, Math.floor(leftover / (entries.length - 1)))
  }

  for (const entry of entries) {
    const line = formatClueLine(entry)
    const lines = estimateWrappedLines(line, fontSize, area.width)
    const height = clueBoxHeight(lines, fontSize)
    objects.push(
      buildText(
        {
          left: area.left,
          top,
          text: line,
          fontFamily: font,
          fontSize,
          fontWeight: 'normal',
          width: area.width,
          height,
          textAlign: 'left',
          originX: 'left',
          lineHeight: CLUE_LINE_HEIGHT,
        },
        tag,
        'prompt',
      ),
    )
    top += height + gap
  }

  return groupClueColumn(objects, tag)
}

function groupClueColumn(
  objects: StudioFabricObject[],
  tag: StudioTag,
): StudioFabricObject | null {
  const bounds = unionObjectBounds(objects)
  if (!bounds) return null
  return buildGroup(
    objects,
    {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height + CLUE_GROUP_PAD,
    },
    tag,
  )
}

/**
 * ACROSS | DOWN under the grid.
 * Each column is its own group; both columns are grouped and centered.
 */
export function drawClueLists(
  entries: CrosswordEntry[],
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject | null {
  const across = entries
    .filter((e) => e.dir === 'across')
    .sort((a, b) => a.number - b.number)
  const down = entries
    .filter((e) => e.dir === 'down')
    .sort((a, b) => a.number - b.number)

  const padded = insetBox(area, 2)
  const titleSize = Math.max(14, STUDIO_BODY_SIZE - 6)
  const listHeight = Math.max(0, padded.height - titleSize - 8 - CLUE_GROUP_PAD)

  const provisionalColW = Math.max(40, (padded.width - COL_GUTTER) / 2)
  const fontSize = fitClueFontSize(across, down, provisionalColW, listHeight)

  const acrossW = maxClueWidth(across, fontSize, provisionalColW)
  const downW = maxClueWidth(down, fontSize, provisionalColW)
  const titleW = estimateTextBoxWidth('ACROSS', titleSize, provisionalColW)
  const colWidth = Math.min(
    provisionalColW,
    Math.max(acrossW, downW, titleW, 80),
  )
  const blockW = colWidth * 2 + COL_GUTTER
  const blockLeft = padded.left + Math.max(0, (padded.width - blockW) / 2)
  const block: Box = {
    left: blockLeft,
    top: padded.top,
    width: Math.min(blockW, padded.width),
    height: padded.height,
  }

  const [left] = splitLeft(block, colWidth)
  const rightCol: Box = {
    left: left.left + colWidth + COL_GUTTER,
    top: block.top,
    width: colWidth,
    height: block.height,
  }

  const acrossGroup = drawClueColumn('ACROSS', across, left, font, fontSize, tag)
  const downGroup = drawClueColumn('DOWN', down, rightCol, font, fontSize, tag)
  const columns = [acrossGroup, downGroup].filter(
    (g): g is StudioFabricObject => g != null,
  )
  if (columns.length === 0) return null

  const combined = unionObjectBounds(columns)
  if (!combined) return null

  // Re-center the column pair in the clue band (groups stay editable units).
  const centeredLeft = padded.left + Math.max(0, (padded.width - combined.width) / 2)
  const dx = centeredLeft - combined.left
  const shifted = columns.map((col) => ({
    ...col,
    left: (col.left ?? 0) + dx,
  }))
  return buildGroup(shifted, { ...combined, left: centeredLeft }, tag)
}
