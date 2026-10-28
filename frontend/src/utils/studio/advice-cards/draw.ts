import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK_MUTED, STUDIO_RULE, STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'
import { buildLine, buildText } from '../studio-fabric-builders'
import { toNonBreakingSpaces } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { WwFrameStyle } from '../well-wishes/content'
import { drawFrame, grouped, rule, type DrawContext } from '../well-wishes/draw'
import { italicSpec, plainSpec } from '../well-wishes/layout'
import {
  NUMBER_FONT,
  NUMBER_GAP,
  SIGN_GAP,
  boldSpec,
  cardLines,
  type AcCard,
  type AcCardHead,
  type AcPagePlan,
} from './layout'

/** Where a letter's baseline sits below the top of its line box. */
const BASELINE = 0.908
const CUT_DASH = [7, 5]

const withLabel = (obj: StudioFabricObject, label?: string): StudioFabricObject =>
  label ? { ...obj, data: { ...obj.data, [STUDIO_CONTENT_LABEL_KEY]: label } } : obj

/** A single line of text sitting on `y`, as handwriting sits on a rule. */
function onLine(ctx: DrawContext, left: number, y: number, text: string, fontSize: number, fill?: string) {
  const width = hugTextBoxWidth(text, fontSize, Infinity, plainSpec(ctx.font))
  const baseline = y - Math.round(fontSize * 0.14)
  ctx.objects.push(
    buildText(
      {
        left,
        top: Math.round(baseline - fontSize * BASELINE),
        text,
        width,
        fontFamily: ctx.font,
        fontSize,
        lineHeight: 1,
        fill,
      },
      ctx.tag,
      'decoration',
    ),
  )
  return width
}

/**
 * One card: frame, the card heading on cut-apart sets, the sentence to finish,
 * writing lines (numbered on a list card), then the sign-off and its line on
 * the same rhythm.
 *
 * The whole card is one group, so a seller drags or deletes a card in one
 * click. Inside it the parts that only make sense together are grouped again:
 * a frame drawn in several strokes, a number with its line, and the sign-off
 * with the line it is signed on.
 */
export function drawCard(
  ctx: DrawContext,
  options: {
    card: AcCard
    frame: WwFrameStyle
    head: AcCardHead
    labelFont: number
    /** The prompt, already wrapped onto its lines. */
    promptLines: readonly string[]
    list: boolean
    signoff: string
    labels: { frame?: string; title?: string; prompt: string; signoff?: string }
  },
) {
  grouped(ctx, 'structure', (card) => drawCardParts(card, options))
}

function drawCardParts(ctx: DrawContext, options: Parameters<typeof drawCard>[1]) {
  const { card, frame, head, labelFont, promptLines, list, signoff, labels } = options
  grouped(ctx, 'structure', (outline) => drawFrame(outline, card.frame, frame, labels.frame))

  if (head.title) {
    const text = toNonBreakingSpaces(head.title)
    const width = hugTextBoxWidth(text, head.titleFont, card.innerWidth, boldSpec(ctx.font))
    ctx.objects.push(
      withLabel(
        buildText(
          {
            left: Math.round(card.innerLeft + (card.innerWidth - width) / 2),
            top: card.titleTop,
            text,
            width,
            fontFamily: ctx.font,
            fontSize: head.titleFont,
            fontWeight: 'bold',
            lineHeight: 1,
            textAlign: 'center',
          },
          ctx.tag,
          'decoration',
        ),
        labels.title,
      ),
    )
  }

  const promptText = promptLines.map(toNonBreakingSpaces).join('\n')
  ctx.objects.push(
    withLabel(
      buildText(
        {
          left: card.innerLeft,
          top: card.promptTop,
          text: promptText,
          width: Math.min(
            card.innerWidth,
            Math.max(...promptLines.map((line) => hugTextBoxWidth(line, labelFont, Infinity, italicSpec(ctx.font)))),
          ),
          fontFamily: ctx.font,
          fontSize: labelFont,
          fontStyle: 'italic',
          lineHeight: 1,
        },
        ctx.tag,
        'prompt',
      ),
      labels.prompt,
    ),
  )

  const right = card.innerLeft + card.innerWidth
  cardLines(card, promptLines.length, labelFont).forEach((y, index) => {
    if (!list) {
      rule(ctx, card.innerLeft, y, card.innerWidth, STUDIO_RULE_MEDIUM)
      return
    }
    grouped(ctx, 'structure', (item) => {
      const numberWidth = onLine(item, card.innerLeft, y, `${index + 1}.`, NUMBER_FONT, STUDIO_INK_MUTED)
      const lineLeft = card.innerLeft + numberWidth + NUMBER_GAP
      rule(item, lineLeft, y, right - lineLeft, STUDIO_RULE_MEDIUM)
    })
  })

  grouped(ctx, 'structure', (line) => {
    const text = toNonBreakingSpaces(signoff)
    const width = onLine(line, card.innerLeft, card.signY, text, labelFont)
    if (labels.signoff) line.objects[line.objects.length - 1] = withLabel(line.objects.at(-1)!, labels.signoff)
    const lineLeft = card.innerLeft + width + SIGN_GAP
    rule(line, lineLeft, card.signY, right - lineLeft, STUDIO_RULE)
  })
}

/** The dashed cut lines between cut-apart cards, as one piece. */
export function drawCuts(ctx: DrawContext, cuts: AcPagePlan['cuts']) {
  if (cuts.length === 0) return
  grouped(ctx, 'decoration', (guides) => {
    for (const cut of cuts) {
      guides.objects.push(
        buildLine(
          { ...cut, stroke: STUDIO_RULE_MEDIUM, strokeWidth: 1, strokeDashArray: CUT_DASH },
          ctx.tag,
          'decoration',
        ),
      )
    }
  })
}
