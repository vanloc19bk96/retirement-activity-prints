import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import {
  contentBox,
  splitTop,
  rows,
  insetHorizontal,
  drawHeader,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
} from '../studio-layout'
import { buildText, buildLine, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_BODY_SIZE,
  STUDIO_STROKE_NORMAL,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { buildRecallPuzzle } from './recall-questions'
import { drawNBackSymbol } from './draw-symbol'

export function generateRecall(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  symbols: readonly string[],
  n: number,
  font: string,
  _rng: StudioRng,
  options?: { digitFont?: string },
): StudioPageOutput {
  const seqLength = Math.min(20, Math.max(8, Number(config.seqLength ?? 12)))
  const questionCount = Math.min(12, Math.max(3, Number(config.questionCount ?? 6)))
  const { seq, questions } = buildRecallPuzzle({
    symbols,
    seqLength,
    n,
    questionCount,
    seed: ctx.seed,
  })
  const digitFont = options?.digitFont
  const symbolFont = digitFont ?? font
  const indexFont = digitFont ?? font

  const objects: StudioFabricObject[] = []
  const instruction = 'Study the row of items, then cover it. Answer each question from memory'
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  const [studyBox, afterStudy] = splitTop(header.body, 72)
  const itemW = studyBox.width / Math.max(1, seq.length)
  seq.forEach((sym, i) => {
    const left = studyBox.left + i * itemW
    const indexText = String(i + 1)
    const indexSize = STUDIO_BODY_SIZE * 0.6
    objects.push(
      buildText(
        {
          left: left + itemW / 2,
          top: studyBox.top + 4,
          text: indexText,
          width: estimateTextBoxWidth(indexText, indexSize, itemW),
          fontFamily: indexFont,
          fontSize: indexSize,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
    const symSize = Math.min(STUDIO_BODY_SIZE * 1.1, itemW * 0.85)
    objects.push(
      drawNBackSymbol(
        sym,
        {
          left: left + itemW / 2,
          top: boxCenterY(studyBox) + 6,
          size: symSize,
          fontFamily: symbolFont,
          textWidth: itemW,
          originX: 'center',
          textAlign: 'center',
        },
        tag,
        'prompt',
      ),
    )
  })

  const [divBox, questionArea] = splitTop(afterStudy, 44)
  objects.push(
    buildLine(
      {
        x1: divBox.left,
        y1: divBox.top + 6,
        x2: divBox.left + divBox.width,
        y2: divBox.top + 6,
        stroke: STUDIO_RULE_LIGHT,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
  )
  const coverNote = 'Cover the row above'
  const coverSize = STUDIO_BODY_SIZE * 0.7
  objects.push(
    buildText(
      {
        left: divBox.left,
        top: divBox.top + 14,
        text: coverNote,
        width: estimateTextBoxWidth(coverNote, coverSize, divBox.width),
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        fontSize: coverSize,
      },
      tag,
      'decoration',
    ),
  )

  const qRows = rows(questionArea, Math.max(1, questions.length), 6)
  const promptOf = (anchorIndex: number) =>
    `What was ${n} position${n > 1 ? 's' : ''} before position ${anchorIndex + 1}?`
  const promptBandCap = (qRows[0]?.width ?? questionArea.width) * 0.68
  // One shared size fitted to the longest question so every row stays on one line.
  const promptSize = questions.reduce(
    (size, q) =>
      Math.min(size, fitFontSizeToWidth(promptOf(q.anchorIndex), promptBandCap, size, 11)),
    STUDIO_BODY_SIZE * 0.8,
  )
  // Shared blank column so answer glyphs stack in one vertical line on the key.
  const promptBandW = questions.reduce((maxW, q) => {
    const w = estimateTextBoxWidth(promptOf(q.anchorIndex), promptSize, promptBandCap)
    return Math.max(maxW, w)
  }, 0)
  const answerSize = STUDIO_BODY_SIZE * 0.9
  const blankGap = 8

  questions.forEach((q, qi) => {
    const row = qRows[qi]
    if (!row) return
    const answer = seq[q.targetIndex] ?? ''
    const prompt = promptOf(q.anchorIndex)
    const promptW = estimateTextBoxWidth(prompt, promptSize, promptBandCap)
    // Top-origin text + line at textTop + fontSize (Fabric textbox baseline).
    const textTop = Math.round(boxCenterY(row) - promptSize / 2)
    const baselineY = textTop + promptSize
    objects.push(
      buildText(
        {
          left: row.left,
          top: textTop,
          text: prompt,
          width: promptW,
          fontFamily: font,
          fontSize: promptSize,
        },
        tag,
        'prompt',
      ),
    )
    const lineX1 = row.left + promptBandW + blankGap
    const lineX2 = row.left + row.width - 4
    const blankW = Math.max(24, lineX2 - lineX1)
    objects.push(
      buildLine(
        {
          x1: lineX1,
          y1: baselineY,
          x2: lineX2,
          y2: baselineY,
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        tag,
        'decoration',
      ),
    )
    objects.push(
      drawNBackSymbol(
        answer,
        {
          left: lineX1 + blankW / 2,
          top: boxCenterY(row),
          size: Math.min(answerSize, blankW * 0.85),
          fontFamily: symbolFont,
          fill: STUDIO_INK_MUTED,
          textWidth: blankW,
          originX: 'center',
          textAlign: 'center',
        },
        tag,
        'answer',
      ),
    )
  })

  return { pageRole: 'single', objects }
}
