/**
 * Decade Trivia renderer — turns a measured `TriviaPageLayout` into Fabric JSON.
 *
 * Nothing here decides geometry. Every coordinate comes from `layout.ts`, which
 * measured the same strings with the same font, so what is drawn is exactly what
 * was reserved. Roles follow the answer-key contract in `studio-answer-key.ts`:
 * `structure` (write-in rules) and blanked `prompt` text are dropped on the
 * solution page, and `answer` objects are revealed there.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import { toNonBreakingSpaces, unionObjectBounds } from '../studio-layout'
import {
  buildCircle,
  buildGroup,
  buildLine,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  STUDIO_INK,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  MARKER_RING_RATIO,
  PROMPT_LINE_HEIGHT,
  type QuestionBlock,
  type TriviaPageLayout,
} from './layout'

/**
 * One drawn textbox.
 *
 * * **NBSP on every hard-wrapped line.** Layout already broke the copy at a
 *   padded measure. Locking spaces makes each `\n` line one Fabric word so a
 *   metric mismatch cannot soft-wrap into extra lines — that is what stacked
 *   prompt glyphs on top of the A–D options. `wrapSafeWidth` keeps each locked
 *   line narrower than the textbox so Fabric does not expand past the margin.
 * * **Explicit height.** Fabric recomputes it, but `unionObjectBounds` reads it
 *   at generate time, so group bounds would otherwise clip multi-line text.
 */
function textObject(
  spec: {
    left: number
    top: number
    text: string
    width: number
    fontSize: number
    lineCount: number
    lineHeight?: number
    fill?: string
    textAlign?: 'left' | 'center' | 'right'
    originX?: 'left' | 'center' | 'right'
    originY?: 'top' | 'center' | 'bottom'
    /** Lock spaces so a hard-wrapped line cannot soft-wrap into unreserved height. */
    lockSpaces?: boolean
  },
  font: string,
  tag: StudioTag,
  role: 'prompt' | 'answer' | 'decoration',
): StudioFabricObject {
  const lineHeight = spec.lineHeight ?? 1
  // Default on: every Decade Trivia textbox is pre-wrapped; unlocked spaces are
  // how prompt lines used to reflow onto the option rows under them.
  const text = spec.lockSpaces === false ? spec.text : toNonBreakingSpaces(spec.text)
  return {
    ...buildText(
      {
        left: spec.left,
        top: spec.top,
        text,
        fontFamily: font,
        fontSize: spec.fontSize,
        width: spec.width,
        lineHeight,
        ...(spec.fill !== undefined ? { fill: spec.fill } : {}),
        ...(spec.textAlign !== undefined ? { textAlign: spec.textAlign } : {}),
        ...(spec.originX !== undefined ? { originX: spec.originX } : {}),
        ...(spec.originY !== undefined ? { originY: spec.originY } : {}),
      },
      tag,
      role,
    ),
    height: fabricTextHeight(spec.lineCount, spec.fontSize, lineHeight),
  }
}

function drawNumber(
  parts: StudioFabricObject[],
  block: QuestionBlock,
  fontSize: number,
  font: string,
  spec: FontSpec,
  tag: StudioTag,
): void {
  const width = hugTextBoxWidth(block.numberText, fontSize, block.textWidth, spec)
  parts.push(
    textObject(
      {
        left: block.numberRight,
        top: block.numberTop,
        text: block.numberText,
        width,
        fontSize,
        lineCount: 1,
        lineHeight: PROMPT_LINE_HEIGHT,
        textAlign: 'right',
        originX: 'right',
        lockSpaces: true,
      },
      font,
      tag,
      'prompt',
    ),
  )
}

function drawOptions(
  parts: StudioFabricObject[],
  block: QuestionBlock,
  optionSize: number,
  font: string,
  spec: FontSpec,
  tag: StudioTag,
): void {
  for (const cell of block.options ?? []) {
    parts.push(
      textObject(
        {
          left: cell.markerCx,
          top: cell.markerCy,
          text: cell.letter,
          width: hugTextBoxWidth(cell.letter, optionSize, optionSize * 2, spec),
          fontSize: optionSize,
          lineCount: 1,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lockSpaces: true,
        },
        font,
        tag,
        'prompt',
      ),
      textObject(
        {
          left: cell.bodyLeft,
          top: cell.centerY,
          text: cell.text,
          // Hug the run; fitOptionSize already kept every option inside the
          // column with wrapSafeWidth-class pad so NBSP cannot expand past it.
          width: hugTextBoxWidth(cell.text, optionSize, cell.bodyWidth, spec),
          fontSize: optionSize,
          lineCount: 1,
          originY: 'center',
        },
        font,
        tag,
        'prompt',
      ),
    )

    if (!cell.correct) continue
    parts.push(
      buildCircle(
        {
          left: cell.markerCx,
          top: cell.markerCy,
          radius: optionSize * MARKER_RING_RATIO,
          fill: 'transparent',
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_NORMAL,
          strokeUniform: true,
        },
        tag,
        'answer',
      ),
    )
  }
}

function drawBlock(
  block: QuestionBlock,
  layout: TriviaPageLayout,
  font: string,
  spec: FontSpec,
  tag: StudioTag,
): StudioFabricObject[] {
  const { fontSize, optionSize } = layout
  const parts: StudioFabricObject[] = []

  drawNumber(parts, block, fontSize, font, spec, tag)
  parts.push(
    textObject(
      {
        left: block.textLeft,
        top: block.promptTop,
        text: block.promptLines.join('\n'),
        width: block.textWidth,
        fontSize,
        lineCount: block.promptLines.length,
        lineHeight: PROMPT_LINE_HEIGHT,
      },
      font,
      tag,
      'prompt',
    ),
  )

  if (block.options?.length) {
    drawOptions(parts, block, optionSize, font, spec, tag)
  } else if (block.solutionLines?.length) {
    // Inline write-in: the solution is the same sentence with the blank filled.
    // It sits exactly on the prompt and only becomes visible on the answer key,
    // where the blanked prompt is dropped by `shouldOmitFromAnswerPage`.
    parts.push(
      textObject(
        {
          left: block.textLeft,
          top: block.promptTop,
          text: block.solutionLines.join('\n'),
          width: block.textWidth,
          fontSize,
          lineCount: block.solutionLines.length,
          lineHeight: PROMPT_LINE_HEIGHT,
          fill: STUDIO_INK,
        },
        font,
        tag,
        'answer',
      ),
    )
  } else if (block.writeRule) {
    parts.push(
      buildLine(
        {
          x1: block.writeRule.left,
          y1: block.writeRule.y,
          x2: block.writeRule.left + block.writeRule.width,
          y2: block.writeRule.y,
          stroke: STUDIO_RULE_LIGHT,
        },
        tag,
        'structure',
      ),
    )
    const answer = block.item.answer.trim()
    if (answer && block.answerTop != null) {
      parts.push(
        textObject(
          {
            left: block.textLeft,
            top: block.answerTop,
            text: answer,
            width: hugTextBoxWidth(answer, fontSize, block.writeRule.width, spec),
            fontSize,
            lineCount: 1,
            fill: STUDIO_INK,
          },
          font,
          tag,
          'answer',
        ),
      )
    }
  }

  return parts
}

/**
 * Draw the whole page. Each question becomes one group so the author can move a
 * complete Q+A unit in the editor without it coming apart.
 */
export function drawTriviaPage(
  layout: TriviaPageLayout,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const spec: FontSpec = { fontFamily: font }
  const objects: StudioFabricObject[] = []

  for (const block of layout.blocks) {
    const parts = drawBlock(block, layout, font, spec, tag)
    const bounds = unionObjectBounds(parts)
    if (!bounds) continue
    objects.push({
      ...buildGroup(parts, bounds, tag, 'prompt'),
      // These bounds come from predicted text metrics. A cached group would
      // rasterise into a canvas exactly that size and slice any glyph that
      // lands outside — a word cut in half is far worse than one that sits a
      // few pixels wide, so let the group draw straight to the canvas.
      objectCaching: false,
    })
  }

  return objects
}
