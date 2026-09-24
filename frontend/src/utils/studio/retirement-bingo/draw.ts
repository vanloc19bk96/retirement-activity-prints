import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { toNonBreakingSpaces } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  BINGO_CENTER_INDEX,
  BINGO_SIZE,
  RETIREMENT_BINGO_FREE_LABEL,
  RETIREMENT_BINGO_FREE_TEXT,
  type RetirementBingoMoment,
} from './content'
import {
  PHRASE_FONT_MIN,
  PHRASE_LINE_HEIGHT,
  wrapBingoPhrase,
  type RetirementBingoPagePlan,
} from './layout'

/**
 * One bingo card, drawn in print order: the column letters, the grid, the
 * squares, and the write-in line under it.
 *
 * Everything is flat on the page rather than grouped, so a seller who wants to
 * reword one square double-clicks it and types — no ungrouping, no hunting
 * for the text inside a locked block.
 */

/**
 * Tint behind the free square. About ten percent grey: visible on a KDP
 * black-and-white interior, light enough that a pencil mark still shows on it.
 * The square is also framed and set in bold capitals, so nothing about it
 * depends on the tint surviving the press.
 */
export const BINGO_FREE_SHADE = '#E5E7EB'

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const

/** "I got BINGO on ______" — the one line of the page that is the reader's own. */
export const BINGO_FOOTER_LABEL = 'I got BINGO on'

/** Share of a phrase-square the NAP word may span. */
const NAP_WIDTH_SHARE = 0.78
const NAP_FONT_RATIO = 0.3
const FREE_FONT_RATIO = 0.11
/** FREE is tracked out so it reads as a label, not as a word in the phrase. */
const FREE_CHAR_SPACING = 180

function cellCenter(plan: RetirementBingoPagePlan, index: number) {
  const { cell } = plan.metrics
  const row = Math.floor(index / BINGO_SIZE)
  const col = index % BINGO_SIZE
  return {
    left: plan.gridLeft + col * cell,
    top: plan.gridTop + row * cell,
    x: plan.gridLeft + col * cell + cell / 2,
    y: plan.gridTop + row * cell + cell / 2,
  }
}

function drawColumnLetters(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  font: string,
  tag: StudioTag,
): void {
  const { cell, letterFont } = plan.metrics
  const spec: FontSpec = { fontFamily: font, fontWeight: 700 }
  BINGO_LETTERS.forEach((letter, col) => {
    objects.push(
      buildText(
        {
          left: plan.gridLeft + col * cell + cell / 2,
          top: plan.letterTop,
          text: letter,
          width: hugTextBoxWidth(letter, letterFont, cell, spec),
          fontFamily: font,
          fontSize: letterFont,
          fontWeight: 700,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
    )
  })
}

/**
 * The free square: tinted, framed inside its rules, FREE over NAP.
 *
 * Three independent cues — tint, inner frame, bold capitals — so the square
 * still reads as "already yours" on a press that drops the tint to white.
 */
function drawFreeSquare(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  font: string,
  tag: StudioTag,
): void {
  const { cell, pad } = plan.metrics
  const { left, top, x, y } = cellCenter(plan, BINGO_CENTER_INDEX)
  const inset = Math.max(4, Math.round(pad * 0.7))
  const frame = cell - inset * 2

  objects.push(
    buildRect(
      {
        left: left + inset,
        top: top + inset,
        width: frame,
        height: frame,
        fill: BINGO_FREE_SHADE,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
  )

  const napSpec: FontSpec = { fontFamily: font, fontWeight: 700 }
  let napFont = Math.round(cell * NAP_FONT_RATIO)
  while (
    napFont > PHRASE_FONT_MIN &&
    measureRunWidth(RETIREMENT_BINGO_FREE_TEXT, napFont, napSpec) > frame * NAP_WIDTH_SHARE
  ) {
    napFont -= 1
  }
  const freeFont = Math.max(
    Math.round(PHRASE_FONT_MIN * 0.8),
    Math.min(plan.phraseFont, Math.round(cell * FREE_FONT_RATIO)),
  )
  const gap = Math.max(2, Math.round(cell * 0.03))
  const freeHeight = fabricTextHeight(1, freeFont, 1)
  const napHeight = fabricTextHeight(1, napFont, 1)
  const stackTop = y - (freeHeight + gap + napHeight) / 2
  const textWidth = frame - 4

  objects.push(
    buildText(
      {
        left: x,
        top: stackTop,
        text: RETIREMENT_BINGO_FREE_LABEL,
        width: textWidth,
        fontFamily: font,
        fontSize: freeFont,
        fontWeight: 700,
        charSpacing: FREE_CHAR_SPACING,
        textAlign: 'center',
        originX: 'center',
        lineHeight: 1,
      },
      tag,
      'structure',
    ),
    buildText(
      {
        left: x,
        top: stackTop + freeHeight + gap,
        text: RETIREMENT_BINGO_FREE_TEXT,
        width: textWidth,
        fontFamily: font,
        fontSize: napFont,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
        lineHeight: 1,
      },
      tag,
      'structure',
    ),
  )
}

function drawMoments(
  objects: StudioFabricObject[],
  moments: readonly RetirementBingoMoment[],
  plan: RetirementBingoPagePlan,
  font: string,
  tag: StudioTag,
): void {
  const { metrics, phraseFont } = plan
  let next = 0
  for (let index = 0; index < BINGO_SIZE * BINGO_SIZE; index++) {
    if (index === BINGO_CENTER_INDEX) continue
    const moment = moments[next++]
    if (!moment) continue
    // Pre-broken and set in a box wider than any line, so Fabric keeps the
    // planned breaks instead of re-wrapping onto a line the square has no room for.
    const lines =
      plan.lines.get(moment.text) ??
      wrapBingoPhrase(moment.text, phraseFont, metrics.fitWidth, { fontFamily: font }) ??
      [moment.text]
    const { x, y } = cellCenter(plan, index)
    objects.push(
      buildText(
        {
          left: x,
          top: y,
          text: lines.join('\n'),
          width: metrics.textBoxWidth,
          fontFamily: font,
          fontSize: phraseFont,
          lineHeight: PHRASE_LINE_HEIGHT,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
  }
}

function drawFooter(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  font: string,
  tag: StudioTag,
): void {
  const { cell, footerFont } = plan.metrics
  const spec: FontSpec = { fontFamily: font }
  // Non-breaking: a label that wraps puts "on" under the line it introduces.
  const label = toNonBreakingSpaces(BINGO_FOOTER_LABEL)
  const labelWidth = hugTextBoxWidth(label, footerFont, plan.gridSize, spec)
  const gap = Math.round(footerFont * 0.5)
  const ruleWidth = Math.max(
    0,
    Math.min(Math.round(cell * 1.8), plan.gridSize - labelWidth - gap),
  )
  const total = labelWidth + gap + ruleWidth
  const left = Math.round(plan.gridLeft + (plan.gridSize - total) / 2)

  objects.push(
    buildText(
      {
        left,
        top: plan.footerTop,
        text: label,
        width: labelWidth,
        fontFamily: font,
        fontSize: footerFont,
        lineHeight: 1,
      },
      tag,
      'decoration',
    ),
  )
  if (ruleWidth <= 0) return
  objects.push(
    buildRect(
      {
        left: left + labelWidth + gap,
        // On the baseline, where a hand writes, not under the descenders.
        top: plan.footerTop + Math.round(footerFont * 0.95),
        width: ruleWidth,
        height: STUDIO_STROKE_HAIRLINE,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'decoration',
    ),
  )
}

export function drawRetirementBingoCard(
  objects: StudioFabricObject[],
  options: {
    moments: readonly RetirementBingoMoment[]
    plan: RetirementBingoPagePlan
    font: string
    tag: StudioTag
  },
): void {
  const { moments, plan, font, tag } = options
  drawColumnLetters(objects, plan, font, tag)
  // The free square goes down before the rules, so nothing overprints them.
  drawFreeSquare(objects, plan, font, tag)
  objects.push(
    ...drawGridLines(
      { left: plan.gridLeft, top: plan.gridTop, width: plan.gridSize, height: plan.gridSize },
      plan.metrics.cell,
      BINGO_SIZE,
      BINGO_SIZE,
      tag,
      {
        thickness: STUDIO_STROKE_NORMAL,
        fill: STUDIO_RULE,
        boxCols: BINGO_SIZE,
        boxRows: BINGO_SIZE,
        boldThickness: STUDIO_STROKE_BOLD,
      },
    ),
  )
  drawMoments(objects, moments, plan, font, tag)
  drawFooter(objects, plan, font, tag)
}
