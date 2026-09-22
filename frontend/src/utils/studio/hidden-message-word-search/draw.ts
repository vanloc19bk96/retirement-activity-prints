import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { hugTextBoxWidth, wrapTextToWidth, type FontSpec } from '../studio-text-metrics'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK } from '@/constants/studio.constants'
import {
  LETTER_MIN,
  MESSAGE_LABEL,
  MESSAGE_LABEL_SIZE,
  MESSAGE_SLOT_MAX,
  MESSAGE_SLOT_MIN,
  messageLabelHeight,
  messageLineHeight,
  messageRuleWidth,
  messageWordGap,
  wrapMessageLines,
  type MessageBandPlan,
} from './layout'
import type { HiddenMessagePuzzle } from './place'

/** Hairline write-in rule — a filled bar, not a stroked rect that prints grey. */
const RULE_HEIGHT = 1
/** Where the rule sits inside its line, and where the answer glyph sits above it. */
const RULE_BASELINE_RATIO = 0.72
const ANSWER_BASELINE_RATIO = 0.38
/** Answer letters are hidden on the puzzle page; they only need to fit the slot. */
const ANSWER_LETTER_RATIO = 0.62

export function leftoverCellSet(puzzle: HiddenMessagePuzzle): Set<string> {
  return new Set(puzzle.leftoverCells.map((cell) => `${cell.r},${cell.c}`))
}

export interface MessageStrip {
  slot: number
  wordGap: number
  lineHeight: number
  lines: string[][]
  /** Rules plus caption — the whole strip. */
  height: number
  answerFontSize: number
  labelled: boolean
}

/**
 * Fit the saying's write-in rules to the strip the page reserved for them.
 *
 * The reservation was made against the level's longest possible saying at the
 * floor slot width, so the real saying almost always has room to spare. That
 * spare goes into wider slots rather than into blank paper: a retirement book's
 * answer line is written on by hand, and the difference between a fifth of an
 * inch and a third is the difference between a comfortable capital and a
 * cramped one.
 *
 * Returns null when even the floor width will not fit — the page is then not
 * printable as laid out, which `kdp-preflight` turns into a refusal rather than
 * a strip that overruns the bottom margin.
 */
export function fitMessageStrip(
  area: Box,
  boxWords: readonly string[],
  band: MessageBandPlan,
): MessageStrip | null {
  if (boxWords.length === 0) return null

  const labelHeight = messageLabelHeight(band.labelled)
  for (let slot = MESSAGE_SLOT_MAX; slot >= MESSAGE_SLOT_MIN; slot--) {
    const lines = wrapMessageLines(boxWords, slot, area.width)
    // Never more lines than the page reserved, whatever the width allows.
    if (lines.length > band.lines) continue
    const lineHeight = messageLineHeight(slot)
    const height = lines.length * lineHeight + labelHeight
    if (height > area.height) continue
    return {
      slot,
      wordGap: messageWordGap(slot),
      lineHeight,
      lines,
      height,
      answerFontSize: Math.max(LETTER_MIN, Math.floor(slot * ANSWER_LETTER_RATIO)),
      labelled: band.labelled,
    }
  }
  return null
}

function lineWidth(words: readonly string[], slot: number, wordGap: number): number {
  let width = 0
  for (let i = 0; i < words.length; i++) {
    width += words[i]!.length * slot
    if (i < words.length - 1) width += wordGap
  }
  return width
}

/**
 * One writing rule per letter, with visible breaks between words.
 *
 * The rules are grouped and the answer letters are not: the group is a single
 * object a seller can nudge, while each hidden answer glyph has to stay
 * individually harvestable for the solution page.
 */
export function drawMessageWritingLines(options: {
  area: Box
  strip: MessageStrip
  letters: string
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { area, strip, letters, font, tag } = options
  const stripTop = area.top + Math.max(0, Math.round((area.height - strip.height) / 2))
  const objects: StudioFabricObject[] = []
  const labelHeight = messageLabelHeight(strip.labelled)

  if (strip.labelled) {
    // Left-aligned, not centred: it labels the rules under it rather than
    // announcing itself, and a centred caption over a centred run of rules
    // reads as a second heading.
    objects.push(
      buildText(
        {
          left: area.left,
          top: stripTop,
          text: MESSAGE_LABEL,
          fontFamily: font,
          fontSize: MESSAGE_LABEL_SIZE,
          fontWeight: 'normal',
          width: estimateTextBoxWidth(MESSAGE_LABEL, MESSAGE_LABEL_SIZE, area.width),
          textAlign: 'left',
          originX: 'left',
        },
        tag,
        'decoration',
      ),
    )
  }

  const top = stripTop + labelHeight
  const rules: StudioFabricObject[] = []
  const answers: StudioFabricObject[] = []
  const ruleWidth = messageRuleWidth(strip.slot)
  let letterIndex = 0

  strip.lines.forEach((line, row) => {
    const width = lineWidth(line, strip.slot, strip.wordGap)
    let cursor = area.left + Math.max(0, Math.round((area.width - width) / 2))
    const lineTop = top + row * strip.lineHeight
    const ruleY = Math.round(lineTop + strip.lineHeight * RULE_BASELINE_RATIO)
    const answerY = Math.round(lineTop + strip.lineHeight * ANSWER_BASELINE_RATIO)

    for (let w = 0; w < line.length; w++) {
      for (const fallback of line[w]!) {
        const centerX = cursor + strip.slot / 2
        rules.push(
          buildRect(
            {
              left: Math.round(centerX - ruleWidth / 2),
              top: ruleY,
              width: ruleWidth,
              height: RULE_HEIGHT,
              fill: STUDIO_INK,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'structure',
          ),
        )
        const answer = letters[letterIndex] ?? fallback
        letterIndex += 1
        answers.push(
          buildText(
            {
              left: centerX,
              top: answerY,
              text: answer,
              fontFamily: font,
              fontSize: strip.answerFontSize,
              width: estimateTextBoxWidth(answer, strip.answerFontSize, strip.slot),
              textAlign: 'center',
              originX: 'center',
              originY: 'center',
              lineHeight: 1,
            },
            tag,
            'answer',
          ),
        )
        cursor += strip.slot
      }
      if (w < line.length - 1) cursor += strip.wordGap
    }
  })

  const bounds = unionObjectBounds(rules)
  if (bounds) objects.push(buildGroup(rules, bounds, tag, 'structure'))
  return [...objects, ...answers]
}

/**
 * The saying, set as one line of plain text on the solution page.
 *
 * Caps run wider than the shared per-character estimate, so the size is walked
 * down against a real measurement and the spaces are locked: a saying that
 * soft-wraps mid-phrase on the answer page is the one thing a reader checking
 * their work cannot afford to misread.
 */
export function drawSolutionMessage(options: {
  area: Box
  text: string
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { area, text, font, tag } = options
  const saying = text.trim()
  if (!saying || area.height < LETTER_MIN) return null

  const spec: FontSpec = { fontFamily: font, fontWeight: 'normal' }
  const maxWidth = Math.max(1, area.width)
  const locked = toNonBreakingSpaces(saying)
  const runWidth = (value: string, size: number) =>
    hugTextBoxWidth(value, size, Number.POSITIVE_INFINITY, spec)

  const preferred = Math.max(
    LETTER_MIN,
    Math.min(MESSAGE_SLOT_MAX, Math.floor(area.height * 0.55)),
  )
  let fontSize = preferred
  while (fontSize > LETTER_MIN && runWidth(locked, fontSize) > maxWidth) fontSize -= 1

  const body =
    runWidth(locked, fontSize) <= maxWidth
      ? locked
      : wrapTextToWidth(saying, fontSize, maxWidth, spec).map(toNonBreakingSpaces).join('\n')

  return buildText(
    {
      left: boxCenterX(area),
      top: boxCenterY(area),
      text: body,
      fontFamily: font,
      fontSize,
      fontWeight: 'normal',
      width: hugTextBoxWidth(body, fontSize, maxWidth, spec),
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      lineHeight: 1,
    },
    tag,
    'answer',
  )
}
