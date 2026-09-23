import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { buildIconPath } from '../studio-icon'
import { hugTextBoxWidth, wrapSafeWidth, wrapTextToWidth } from '../studio-text-metrics'
import { answerSlotOffsets, type PictureRebusPuzzle } from './content'
import {
  HINT_LINE_HEIGHT,
  RULE_HEIGHT,
  iconBandWidth,
  iconBoxHeight,
  slotBandWidth,
  type PictureRebusPagePlan,
  type PictureRebusRowBox,
} from './layout'

/**
 * One puzzle, drawn.
 *
 * A row reads top to bottom in the order it is solved: the pictures, the hint
 * if the level gives one, then the slots the answer is written into. The number
 * sits beside the pictures rather than above them, so the eye runs "3 — these
 * two things" as one line.
 *
 * The pictures are Lucide line paths, painted to a single black ink weight by
 * `buildIconPath`. That choice is the reason this game can be printed at all:
 * an emoji would render as whatever face the browser, the exporter, the
 * operating system and the printer each happened to pick, and a colour emoji
 * flattens to a grey blob on a KDP interior. A path is the same path
 * everywhere, it scales without resampling, and it is already monochrome.
 */

/** The written answer is lifted off its rule so the glyph does not sit on ink. */
const ANSWER_LIFT_RATIO = 0.1

/** Reduces a picture to one token when a page is fingerprinted for uniqueness. */
function iconCanonicalKey(iconName: string): string {
  return `picture-rebus:icon:${iconName}`
}

/**
 * The pictures of one puzzle, centred in the row's band.
 *
 * The "+" between them is drawn as type rather than as a rule or an arrow
 * because it is the one mark every reader of this book already knows means
 * "and then". It is set muted and at under half the picture size: it joins the
 * pictures, it is not a third one.
 */
function drawIconBand(
  objects: StudioFabricObject[],
  options: {
    puzzle: PictureRebusPuzzle
    plan: PictureRebusPagePlan
    bandCenterX: number
    centerY: number
    font: string
    tag: StudioTag
  },
): void {
  const { puzzle, plan, bandCenterX, centerY, font, tag } = options
  const { metrics } = plan
  const width = iconBandWidth(puzzle.icons.length, metrics)
  let cursor = bandCenterX - width / 2 + metrics.iconPad

  puzzle.icons.forEach((icon, index) => {
    if (index > 0) {
      const gapStart = cursor
      const plusCenterX = gapStart + metrics.plusGap + metrics.plusWidth / 2
      objects.push(
        buildText(
          {
            left: plusCenterX,
            top: centerY,
            text: '+',
            width: hugTextBoxWidth('+', metrics.plusFont, metrics.plusWidth, {
              fontFamily: font,
            }),
            fontFamily: font,
            fontSize: metrics.plusFont,
            fill: STUDIO_INK_MUTED,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
          },
          tag,
          // Not `decoration`: the answer key drops decoration copy, and a
          // solution page showing two pictures with nothing between them no
          // longer states the puzzle it is answering.
          'structure',
        ),
      )
      cursor += metrics.plusWidth + metrics.plusGap * 2
    }

    const built = buildIconPath(
      icon.name,
      {
        left: cursor + metrics.iconSize / 2,
        top: centerY,
        size: metrics.iconSize,
        strokeWidth: metrics.iconStroke,
      },
      tag,
      'prompt',
    )
    objects.push({
      ...built,
      data: {
        ...(built.data ?? {}),
        // A picture is one thing to the uniqueness check, not the forty path
        // segments Lucide draws it with. Without this a page fingerprint is a
        // transcript of every curve on it.
        studioCanonicalKey: iconCanonicalKey(icon.name),
      },
    })
    cursor += metrics.iconSize
  })
}

/**
 * One rule per letter, with the answer written above them.
 *
 * Every letter is drawn, hidden. That is what lets the editor reveal a single
 * sheet in place without regenerating it, and what makes the solution page a
 * picture of this same page with the answers filled in rather than a bare list
 * a reader has to match back up to the puzzles.
 *
 * The gap between two words is wider than the gap between two letters, so an
 * answer written in reads back as the two words it is.
 */
function drawAnswerSlots(
  objects: StudioFabricObject[],
  options: {
    puzzle: PictureRebusPuzzle
    plan: PictureRebusPagePlan
    bandCenterX: number
    ruleY: number
    font: string
    tag: StudioTag
  },
): void {
  const { puzzle, plan, bandCenterX, ruleY, font, tag } = options
  const { metrics } = plan
  const letters = puzzle.answer.replace(/ /g, '')
  const offsets = answerSlotOffsets(puzzle.answer)
  const left = bandCenterX - slotBandWidth(puzzle.answer, metrics) / 2
  const lift = Math.round(metrics.slotWidth * ANSWER_LIFT_RATIO)

  offsets.forEach((offset, index) => {
    const centerX = left + offset * metrics.slotWidth + metrics.slotWidth / 2
    objects.push(
      buildRect(
        {
          left: Math.round(centerX - metrics.ruleWidth / 2),
          top: ruleY,
          width: metrics.ruleWidth,
          height: RULE_HEIGHT,
          fill: STUDIO_INK,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        tag,
        'structure',
      ),
    )

    const letter = letters[index]!
    objects.push(
      buildText(
        {
          left: centerX,
          top: ruleY - lift,
          text: letter,
          width: hugTextBoxWidth(letter, metrics.answerFont, metrics.slotWidth, {
            fontFamily: font,
          }),
          fontFamily: font,
          fontSize: metrics.answerFont,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          lineHeight: 1,
        },
        tag,
        'answer',
      ),
    )
  })
}

export interface DrawPictureRebusRowOptions {
  puzzle: PictureRebusPuzzle
  /** Zero-based; the page prints it as index + 1. */
  index: number
  box: PictureRebusRowBox
  plan: PictureRebusPagePlan
  font: string
  tag: StudioTag
}

export function drawPictureRebusRow(
  objects: StudioFabricObject[],
  options: DrawPictureRebusRowOptions,
): void {
  const { puzzle, index, box, plan, font, tag } = options
  const { metrics } = plan
  const spec = { fontFamily: font }

  const bandLeft = box.left + metrics.indexWidth
  const bandCenterX = bandLeft + plan.bandWidth / 2
  const iconCenterY = box.top + metrics.iconPad + metrics.iconSize / 2

  const label = `${index + 1}.`
  objects.push(
    buildText(
      {
        left: box.left,
        top: iconCenterY,
        text: label,
        width: hugTextBoxWidth(label, metrics.indexFont, metrics.indexWidth, spec),
        fontFamily: font,
        fontSize: metrics.indexFont,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )

  drawIconBand(objects, { puzzle, plan, bandCenterX, centerY: iconCenterY, font, tag })

  if (plan.showHint) {
    // Pre-broken to the band and set in a box as wide as the band, so Fabric has
    // no reason to re-wrap the hint onto a line the row did not reserve.
    const lines = wrapTextToWidth(
      puzzle.hint,
      metrics.hintFont,
      wrapSafeWidth(plan.bandWidth, spec),
      spec,
    ).slice(0, plan.hintLineCount)
    objects.push(
      buildText(
        {
          left: bandCenterX,
          top: box.top + iconBoxHeight(metrics) + metrics.hintGap,
          text: lines.join('\n'),
          width: plan.bandWidth,
          fontFamily: font,
          fontSize: metrics.hintFont,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
          lineHeight: HINT_LINE_HEIGHT,
        },
        tag,
        'prompt',
      ),
    )
  }

  drawAnswerSlots(objects, {
    puzzle,
    plan,
    bandCenterX,
    ruleY: box.top + plan.rowHeight - RULE_HEIGHT,
    font,
    tag,
  })
}
