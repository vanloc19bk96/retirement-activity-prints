import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { FittedRjItem } from './fit'
import { TEXT_LINE_HEIGHT, itemNumber, textHeight, type RjPagePlan } from './layout'

/**
 * `puzzle` — numbered setups, nothing else.
 * `answers` — the same numbers, each with its answer in bold.
 */
export type RjDrawMode = 'puzzle' | 'answers'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: RjPagePlan
  font: string
  tag: StudioTag
  mode: RjDrawMode
}

const linesOf = (ctx: DrawContext, item: FittedRjItem) =>
  ctx.mode === 'answers' ? item.answerLines : item.setupLines

function number(ctx: DrawContext, index: number, left: number, top: number) {
  const { metrics } = ctx.plan
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: itemNumber(index),
        width: metrics.numberW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      ctx.tag,
      // Not `decoration`: the answer key drops decoration set at the
      // instruction size, and the numbers must survive onto the key.
      'prompt',
    ),
  )
}

/**
 * The setup, or on the answer page the answer — pre-broken and set in a box
 * exactly the measure it was broken to, so Fabric has no reason to re-wrap it
 * into a line the page did not reserve.
 *
 * Answers are `answer` objects in bold: the key reveals them in its own ink,
 * and bold (not colour) tells them apart in a black-and-white interior. Each
 * text carries its plain wording as a content label, so later pages in the
 * book can refuse to repeat it.
 */
function body(ctx: DrawContext, item: FittedRjItem, left: number, top: number) {
  const { metrics, textWidth } = ctx.plan
  const answers = ctx.mode === 'answers'
  ctx.objects.push({
    ...buildText(
      {
        left: left + metrics.numberW,
        top,
        text: linesOf(ctx, item).join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: answers ? 700 : 400,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      ctx.tag,
      answers ? 'answer' : 'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: answers ? item.answer : item.setup },
  })
}

/**
 * Lay the items out in the body field.
 *
 * Leftover height is spread between the items (up to one extra gap each), and
 * the stack starts just under the header with any remaining white below it —
 * centring the whole stack left a hand's width of paper between the
 * instruction and the first item, which reads as something missing. Blocks
 * are capped in width and centred, so a letter page does not run questions
 * six inches across. A light rule halfway down each gap keeps two items apart
 * without relying on colour.
 */
export function drawRjPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: RjPagePlan
    items: readonly FittedRjItem[]
    font: string
    tag: StudioTag
    mode: RjDrawMode
  },
): void {
  const { field, plan, items, font, tag, mode } = options
  if (items.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag, mode }
  const { metrics } = plan

  const heights = items.map((item) => textHeight(linesOf(ctx, item).length, metrics))
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = items.length - 1
  const slack = Math.max(0, usable - content - metrics.itemGap * gaps)
  const gap = metrics.itemGap + (gaps > 0 ? Math.min(slack / (gaps + 1), metrics.itemGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.font * 0.8))

  items.forEach((item, index) => {
    number(ctx, index, left, top)
    body(ctx, item, left, top)
    top += heights[index]!
    if (index < gaps) {
      objects.push(
        buildRect(
          {
            left,
            top: Math.round(top + gap / 2),
            width: plan.blockWidth,
            height: 1,
            fill: STUDIO_RULE_MEDIUM,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'decoration',
        ),
      )
      top += gap
    }
    top = Math.round(top)
  })
}
