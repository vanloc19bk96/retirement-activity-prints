import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { encodeLetter } from './cipher'
import {
  ROW_CODE_Y,
  ROW_LETTER_Y,
  ROW_RULE_Y,
  RULE_RATIO,
  lineWidth,
  type CryptogramPagePlan,
  type CryptogramSayingLayout,
  type CryptogramSlotMetrics,
} from './layout'

export interface CryptogramPuzzle {
  /** Uppercase A–Z with single spaces. */
  plain: string
  cipher: ReadonlyMap<string, string>
  /** Plain letters printed in before the solver starts. */
  starters: ReadonlySet<string>
}

/**
 * Hairline under every slot. Thin enough not to compete with the letter a
 * solver writes on it, thick enough to survive KDP's print pipeline.
 */
const RULE_HEIGHT = 1

interface SlotOptions {
  centerX: number
  rowTop: number
  metrics: CryptogramSlotMetrics
  letter: string
  puzzle: CryptogramPuzzle
  font: string
  codeFont: string
  tag: StudioTag
  forAnswerKey: boolean
}

/**
 * One letter: a rule to write on, the code beneath it, and the answer above.
 *
 * The answer is drawn either way. A starter letter prints — it is part of the
 * puzzle — and every other letter is a hidden `answer`, which is what lets the
 * editor reveal a single sheet in place without regenerating it.
 */
function drawSlot(objects: StudioFabricObject[], options: SlotOptions): void {
  const { centerX, rowTop, metrics, letter, puzzle, font, codeFont, tag, forAnswerKey } =
    options
  const { slotW, lineH, codeFont: size } = metrics
  const ruleW = Math.round(slotW * RULE_RATIO)
  // Puzzle codes stay black so a small glyph survives KDP. The key can mute
  // them: the answer above is what the reader checks.
  const codeFamily = forAnswerKey ? font : codeFont
  const codeFill = forAnswerKey ? STUDIO_INK_MUTED : STUDIO_INK

  objects.push(
    buildRect(
      {
        left: Math.round(centerX - ruleW / 2),
        top: Math.round(rowTop + lineH * ROW_RULE_Y),
        width: ruleW,
        height: RULE_HEIGHT,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )

  const code = encodeLetter(letter, puzzle.cipher)
  objects.push(
    buildText(
      {
        left: centerX,
        top: rowTop + lineH * ROW_CODE_Y,
        text: code,
        width: hugTextBoxWidth(code, size, slotW, { fontFamily: codeFamily }),
        fontFamily: codeFamily,
        fontSize: size,
        fill: codeFill,
        fontWeight: 'normal',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  const isStarter = puzzle.starters.has(letter)
  objects.push(
    buildText(
      {
        left: centerX,
        top: rowTop + lineH * ROW_LETTER_Y,
        text: letter,
        width: hugTextBoxWidth(letter, size, slotW, { fontFamily: font }),
        fontFamily: font,
        fontSize: size,
        fill: STUDIO_INK,
        fontWeight: 'normal',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      isStarter ? 'prompt' : 'answer',
    ),
  )
}

function drawPuzzleRows(
  objects: StudioFabricObject[],
  options: {
    bandLeft: number
    bandWidth: number
    blockTop: number
    layout: CryptogramSayingLayout
    metrics: CryptogramSlotMetrics
    puzzle: CryptogramPuzzle
    font: string
    codeFont: string
    tag: StudioTag
    forAnswerKey: boolean
  },
): void {
  const { bandLeft, bandWidth, blockTop, layout, metrics, puzzle, font, codeFont, tag, forAnswerKey } =
    options
  const { slotW, wordGap, lineH } = metrics

  layout.lines.forEach((words, row) => {
    const width = lineWidth({ words, slotW, wordGap })
    const rowTop = blockTop + row * lineH
    let cursor = bandLeft + Math.max(0, (bandWidth - width) / 2)
    for (const word of words) {
      for (const letter of word) {
        drawSlot(objects, {
          centerX: cursor + slotW / 2,
          rowTop,
          metrics,
          letter,
          puzzle,
          font,
          codeFont,
          tag,
          forAnswerKey,
        })
        cursor += slotW
      }
      cursor += wordGap
    }
  })
}

function buildPuzzleGroup(options: {
  puzzle: CryptogramPuzzle
  layout: CryptogramSayingLayout
  metrics: CryptogramSlotMetrics
  index: number
  showIndex: boolean
  field: Box
  bandWidth: number
  top: number
  font: string
  codeFont: string
  tag: StudioTag
  forAnswerKey: boolean
}): StudioFabricObject | null {
  const {
    puzzle,
    layout,
    metrics,
    index,
    showIndex,
    field,
    bandWidth,
    top,
    font,
    codeFont,
    tag,
    forAnswerKey,
  } = options
  const parts: StudioFabricObject[] = []
  const bandLeft = showIndex ? field.left + metrics.indexW : field.left

  if (showIndex) {
    const label = `${index + 1}.`
    parts.push(
      buildText(
        {
          left: field.left,
          top: top + metrics.lineH * ROW_RULE_Y,
          text: label,
          width: hugTextBoxWidth(label, metrics.codeFont, metrics.indexW, {
            fontFamily: font,
          }),
          fontFamily: font,
          fontSize: metrics.codeFont,
          fill: STUDIO_INK,
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )
  }

  drawPuzzleRows(parts, {
    bandLeft,
    bandWidth,
    blockTop: top,
    layout,
    metrics,
    puzzle,
    font,
    codeFont,
    tag,
    forAnswerKey,
  })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

export interface CryptogramDrawOptions {
  field: Box
  plan: CryptogramPagePlan
  puzzles: readonly CryptogramPuzzle[]
  font: string
  codeFont: string
  tag: StudioTag
  forAnswerKey?: boolean
}

/**
 * Stack the puzzles down the page.
 *
 * Leftover height is spread between the puzzles before the block is centred,
 * up to one row pitch each. Centring alone leaves a page of two short sayings
 * as a clump in the middle with a hand's width of white above and below it;
 * spreading first is what makes a printed page look composed.
 */
export function drawCryptograms(
  objects: StudioFabricObject[],
  options: CryptogramDrawOptions,
): void {
  const { field, plan, puzzles, font, codeFont, tag, forAnswerKey = false } = options
  const { metrics, layouts, bandWidth, puzzleCount } = plan
  if (puzzleCount === 0) return

  const content = layouts.reduce((sum, layout) => sum + layout.height, 0)
  const gaps = Math.max(0, puzzleCount - 1)
  const slack = Math.max(0, field.height - content - metrics.bandGutter * gaps)
  const spread = gaps > 0 ? Math.min(slack / (gaps + 1), metrics.lineH) : 0
  const gutter = metrics.bandGutter + spread
  const stackH = content + gutter * gaps

  let top = field.top + Math.max(0, (field.height - stackH) / 2)
  for (let i = 0; i < puzzleCount; i++) {
    const layout = layouts[i]!
    const group = buildPuzzleGroup({
      puzzle: puzzles[i]!,
      layout,
      metrics,
      index: i,
      showIndex: puzzleCount > 1,
      field,
      bandWidth,
      top,
      font,
      codeFont,
      tag,
      forAnswerKey,
    })
    if (group) objects.push(group)
    top += layout.height + gutter
  }
}
