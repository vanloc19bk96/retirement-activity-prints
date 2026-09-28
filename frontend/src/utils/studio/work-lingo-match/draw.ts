import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { unionObjectBounds, type Box } from '../studio-layout'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { meaningsByLetter, type FittedWlPair } from './fit'
import {
  MEANINGS_HEADING,
  PHRASES_HEADING,
  TEXT_LINE_HEIGHT,
  answerHeight,
  headingHeight,
  meaningListHeight,
  pairNumber,
  phraseListHeight,
  phraseRowHeight,
  puzzleHeight,
  textHeight,
  textOffset,
  type WlPagePlan,
} from './layout'

/**
 * `puzzle` — numbered phrases with an empty box each, and the lettered meanings.
 * `answers` — the same numbered phrases, each box holding its letter, and the
 * meaning set in italics under its phrase.
 */
export type WlDrawMode = 'puzzle' | 'answers'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: WlPagePlan
  font: string
  tag: StudioTag
  /** Left edge of the centred block. */
  left: number
}

function text(
  ctx: DrawContext,
  spec: {
    left: number
    top: number
    text: string
    width: number
    fontWeight?: number
    fontStyle?: 'italic'
    textAlign?: 'center'
  },
  role: 'prompt' | 'answer' = 'prompt',
): StudioFabricObject {
  return buildText(
    {
      ...spec,
      fontFamily: ctx.font,
      fontSize: ctx.plan.metrics.font,
      fontWeight: spec.fontWeight ?? 400,
      lineHeight: TEXT_LINE_HEIGHT,
    },
    ctx.tag,
    role,
  )
}

/**
 * Pushes `parts` as one group hugging their drawn extent, so a seller drags or
 * deletes a phrase, a meaning or a heading whole in the editor. A lone part is
 * pushed as it is: a group of one only adds a click.
 */
function pushGroup(objects: StudioFabricObject[], parts: StudioFabricObject[], tag: StudioTag) {
  if (parts.length === 1) {
    objects.push(parts[0]!)
    return
  }
  const bounds = unionObjectBounds(parts)
  if (bounds) objects.push(buildGroup(parts, bounds, tag, 'structure'))
}

/** Draws whatever `draw` adds as one group on `ctx.objects` (see `pushGroup`). */
function grouped(ctx: DrawContext, draw: (inner: DrawContext) => void) {
  const parts: StudioFabricObject[] = []
  draw({ ...ctx, objects: parts })
  pushGroup(ctx.objects, parts, ctx.tag)
}

/** A thin rule across a list; structure without colour. */
function rule(ctx: DrawContext, left: number, width: number, top: number) {
  ctx.objects.push(
    buildRect(
      {
        left,
        top: Math.round(top),
        width,
        height: 1,
        fill: STUDIO_RULE_MEDIUM,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/**
 * A list heading in spaced capitals, with a rule under it: one group, so the
 * rule never strays from its heading. Returns the height used.
 */
function heading(ctx: DrawContext, label: string, left: number, width: number, top: number): number {
  const { metrics } = ctx.plan
  grouped(ctx, (inner) => {
    inner.objects.push(
      buildText(
        {
          left,
          top,
          text: label,
          width,
          fontFamily: inner.font,
          fontSize: metrics.headingFont,
          fontWeight: 700,
          charSpacing: 80,
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        inner.tag,
        'decoration',
      ),
    )
    rule(inner, left, width, top + metrics.headingFont + metrics.headingGap / 2)
  })
  return headingHeight(metrics)
}

/** The square the reader writes a letter in — drawn, not typed, so it prints crisp. */
function box(ctx: DrawContext, top: number) {
  const { boxSize } = ctx.plan.metrics
  ctx.objects.push(
    buildRect(
      {
        left: ctx.left,
        top,
        width: boxSize,
        height: boxSize,
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
        rx: 2,
        ry: 2,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/**
 * One phrase row: box, number, phrase in bold. The phrase is pre-broken and
 * set in a box exactly the measure it was broken to, so Fabric has no reason
 * to re-wrap it, and carries its wording as a content label so later pages in
 * the book can refuse to repeat it.
 *
 * On the key, `letter` is written in the box as an `answer` object, and the
 * two are a group of their own, so the letter cannot be dragged out of its
 * box. The caller wraps the row, with anything it adds, into the item's group.
 */
function phraseRow(
  ctx: DrawContext,
  pair: FittedWlPair,
  index: number,
  top: number,
  lines: readonly string[],
  width: number,
  letter?: string,
) {
  const { metrics } = ctx.plan
  const lineTop = top + textOffset(metrics)
  grouped(ctx, (inner) => {
    box(inner, top)
    if (letter === undefined) return
    inner.objects.push(
      text(
        inner,
        { left: inner.left, top: lineTop, text: letter, width: metrics.boxSize, fontWeight: 700, textAlign: 'center' },
        'answer',
      ),
    )
  })
  ctx.objects.push(
    // `prompt`, not `decoration`: the numbers must survive onto the key.
    text(ctx, { left: ctx.left + metrics.markW, top: lineTop, text: pairNumber(index), width: metrics.numberW, fontWeight: 700 }),
    {
      ...text(ctx, {
        left: ctx.left + metrics.markW + metrics.numberW,
        top: lineTop,
        text: lines.join('\n'),
        width,
        fontWeight: 700,
      }),
      data: { [STUDIO_CONTENT_LABEL_KEY]: pair.phrase },
    },
  )
}

/** Leftover height shared between `gaps` gaps — at most one more `cap` each. */
function share(usable: number, content: number, gaps: number, cap: number): number {
  if (gaps <= 0) return 0
  return Math.min(Math.max(0, usable - content) / (gaps + 1), cap)
}

/** Where the stack starts: just under the header, any remaining white below it. */
function firstTop(field: Box, usable: number, stack: number, font: number): number {
  return Math.round(field.top + Math.min(Math.max(0, usable - stack), font * 0.8))
}

/** Phrase rows down from `top`, with `extra` added to every gap. Returns where they end. */
function drawPhrases(ctx: DrawContext, pairs: readonly FittedWlPair[], top: number, extra: number): number {
  const { metrics, phraseWidth } = ctx.plan
  pairs.forEach((pair, index) => {
    grouped(ctx, (row) => phraseRow(row, pair, index, top, pair.phraseLines, phraseWidth))
    top += phraseRowHeight(pair.phraseLines.length, metrics)
    if (index < pairs.length - 1) top = Math.round(top + metrics.rowGap + extra)
  })
  return top
}

/**
 * Lettered meanings down from `top`, A first, with `extra` added to every gap.
 * Each letter and its meaning are one group.
 */
function drawMeanings(ctx: DrawContext, meanings: readonly FittedWlPair[], top: number, extra: number) {
  const { metrics, meaningLeft, meaningWidth } = ctx.plan
  const left = ctx.left + meaningLeft
  meanings.forEach((pair, index) => {
    pushGroup(
      ctx.objects,
      [
        text(ctx, { left, top, text: `${pair.letter}.`, width: metrics.letterW, fontWeight: 700 }),
        text(ctx, { left: left + metrics.letterW, top, text: pair.meaningLines.join('\n'), width: meaningWidth }),
      ],
      ctx.tag,
    )
    top += textHeight(pair.meaningLines.length, metrics)
    if (index < meanings.length - 1) top = Math.round(top + metrics.meaningGap + extra)
  })
}

/**
 * The puzzle page: the phrase list and the meaning list, stacked or side by
 * side as the plan chose.
 *
 * Leftover height is spread between the rows (up to one extra gap each) and
 * the stack starts just under the header. Lists are capped in width and
 * centred, so a letter page does not run meanings across the whole sheet.
 */
function drawPuzzle(ctx: DrawContext, field: Box, pairs: readonly FittedWlPair[]) {
  const { metrics, bottomGuard, arrangement, blockWidth, meaningLeft } = ctx.plan
  const meanings = meaningsByLetter(pairs)
  const phraseLines = pairs.map((p) => p.phraseLines.length)
  const meaningLines = meanings.map((p) => p.meaningLines.length)
  const usable = Math.max(0, field.height - bottomGuard)

  if (arrangement === 'columns') {
    // Each list spreads on its own, so the shorter one does not stop a whole
    // gap per row short of the longer one's foot.
    const gaps = pairs.length - 1
    const body = usable - headingHeight(metrics)
    const phrases = phraseListHeight(phraseLines, metrics)
    const glossary = meaningListHeight(meaningLines, metrics)
    // A letter page's columns are short for its height, so each gap may grow
    // by up to a full line rather than leave the bottom third of the sheet bare.
    const rowExtra = share(body, phrases, gaps, metrics.font)
    const meaningExtra = share(body, glossary, gaps, metrics.font)
    const stack = headingHeight(metrics) + Math.max(phrases + rowExtra * gaps, glossary + meaningExtra * gaps)
    const top = firstTop(field, usable, stack, metrics.font)
    heading(ctx, PHRASES_HEADING, ctx.left, meaningLeft - metrics.gutter, top)
    const listTop = top + heading(ctx, MEANINGS_HEADING, ctx.left + meaningLeft, blockWidth - meaningLeft, top)
    drawPhrases(ctx, pairs, listTop, rowExtra)
    drawMeanings(ctx, meanings, listTop, meaningExtra)
    return
  }

  const content = puzzleHeight(phraseLines, meaningLines, metrics, arrangement)
  const gaps = 2 * (pairs.length - 1) + 1
  const extra = share(usable, content, gaps, metrics.rowGap)
  let top = firstTop(field, usable, content + extra * gaps, metrics.font)
  top += heading(ctx, PHRASES_HEADING, ctx.left, blockWidth, top)
  top = drawPhrases(ctx, pairs, top, extra)
  top = Math.round(top + metrics.sectionGap + extra)
  top += heading(ctx, MEANINGS_HEADING, ctx.left, blockWidth, top)
  drawMeanings(ctx, meanings, top, extra)
}

/**
 * The answer page: every phrase row again, its box holding the letter as an
 * `answer` object in bold — the key reveals it in its own ink — and the exact
 * meaning from the puzzle set in italics under the phrase, so the key reads
 * "1. Circle back · C · Return to the topic later" without turning back.
 * Each entry (box and letter, number, phrase, meaning) is one group.
 */
function drawAnswers(ctx: DrawContext, field: Box, pairs: readonly FittedWlPair[]) {
  const { metrics, bottomGuard, keyPhraseWidth, keyWidth } = ctx.plan
  const content = answerHeight(
    pairs.map((p) => p.keyPhraseLines.length),
    pairs.map((p) => p.keyLines.length),
    metrics,
  )
  const usable = Math.max(0, field.height - bottomGuard)
  const gaps = pairs.length - 1
  const extra = share(usable, content, gaps, metrics.rowGap)
  let top = firstTop(field, usable, content + extra * gaps, metrics.font)

  pairs.forEach((pair, index) => {
    const rowTop = top
    const meaningTop = rowTop + phraseRowHeight(pair.keyPhraseLines.length, metrics) + metrics.innerGap
    grouped(ctx, (row) => {
      phraseRow(row, pair, index, rowTop, pair.keyPhraseLines, keyPhraseWidth, pair.letter)
      row.objects.push(
        text(row, {
          left: row.left + metrics.markW,
          top: meaningTop,
          text: pair.keyLines.join('\n'),
          width: keyWidth,
          fontStyle: 'italic',
        }),
      )
    })
    top = meaningTop + textHeight(pair.keyLines.length, metrics)
    if (index < gaps) top = Math.round(top + metrics.rowGap + extra)
  })
}

export function drawWlPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: WlPagePlan
    pairs: readonly FittedWlPair[]
    font: string
    tag: StudioTag
    mode: WlDrawMode
  },
): void {
  const { field, plan, pairs, font, tag, mode } = options
  if (pairs.length === 0) return
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
  }
  if (mode === 'answers') drawAnswers(ctx, field, pairs)
  else drawPuzzle(ctx, field, pairs)
}
