import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import {
  FABRIC_FONT_SIZE_MULT,
  fabricLinePitch,
  fabricTextHeight,
  hugTextBoxWidth,
} from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { FIF_BLANK_KINDS, type FifKind } from './content'
import {
  STEP_WORDS,
  blankNumberText,
  boldSpec,
  footerHeight,
  headingHeight,
  italicSpec,
  linesHeight,
  placeLine,
  titleHeight,
  wordPageHeight,
  type StoryPageLayout,
  type StoryPagePlan,
  type WordPagePlan,
} from './layout'

const TITLE_LINE_HEIGHT = 1.1
/**
 * Share of a page's leftover height that goes above the block rather than
 * below it. A little under half sits the block at the optical centre — a
 * true centre reads as sagging — without leaving the foot of the page bare.
 */
const OPTICAL_TOP_SHARE = 0.42

function rule(objects: StudioFabricObject[], tag: StudioTag, left: number, top: number, width: number) {
  objects.push(
    buildRect(
      { left, top, width, height: 1, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 },
      tag,
      'structure',
    ),
  )
}

/** One line of text centred on `centre`, hugging its run so it cannot wrap. */
function centredText(
  objects: StudioFabricObject[],
  tag: StudioTag,
  options: {
    text: string
    centre: number
    top: number
    size: number
    font: string
    maxWidth: number
    weight?: number
    italic?: boolean
    role?: 'decoration' | 'prompt'
  },
): StudioFabricObject {
  const spec = options.italic ? italicSpec(options.font) : boldSpec(options.font)
  const width = hugTextBoxWidth(options.text, options.size, options.maxWidth, {
    ...spec,
    fontWeight: options.weight ?? (options.italic ? undefined : 700),
  })
  const object = buildText(
    {
      left: Math.round(options.centre - width / 2),
      top: Math.round(options.top),
      text: toNonBreakingSpaces(options.text),
      width,
      fontFamily: options.font,
      fontSize: options.size,
      fontWeight: options.weight ?? (options.italic ? undefined : 700),
      fontStyle: options.italic ? 'italic' : undefined,
      lineHeight: 1,
      textAlign: 'center',
    },
    tag,
    options.role ?? 'decoration',
  )
  objects.push(object)
  return object
}

/**
 * Step 1: the heading, one numbered row per prompt, and the nudge to turn the
 * page. Nothing of the story appears here — that is the whole game.
 *
 * Rows are only as tall as their label and hint need. Leftover height is
 * spread into the rows (up to a little over half a line each) so a short list
 * breathes; anything still left is split around the block so it sits at the
 * optical centre of the page. The rows themselves are centred across the
 * column: the writing line stops short of the column on a wide trim, and a
 * list hugging the left edge reads off-centre under a centred heading.
 */
export function drawWordPage(
  objects: StudioFabricObject[],
  options: { field: Box; plan: WordPagePlan; kinds: readonly FifKind[]; font: string; tag: StudioTag },
): void {
  const { field, plan, kinds, font, tag } = options
  const m = plan.metrics
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const slack = Math.max(0, usable - wordPageHeight(plan))
  const extra = Math.min(slack / Math.max(1, plan.rowsPerCol + 1), m.font * 0.6)
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  const centre = left + plan.blockWidth / 2
  const rowWidth = m.numberW + m.numberGap + m.labelW + m.ruleGap + plan.ruleW
  const rowInset = Math.max(0, Math.floor((plan.colWidth - rowWidth) / 2))
  const leftover = Math.max(0, slack - extra * (plan.rowsPerCol + 1))
  let top = field.top + Math.round(leftover * OPTICAL_TOP_SHARE)

  centredText(objects, tag, {
    text: STEP_WORDS,
    centre,
    top,
    size: m.heading,
    font,
    maxWidth: plan.blockWidth,
  })
  top += headingHeight(m.heading) + m.headingGap + extra

  const rowH = m.rowH + extra
  const labelLeft = m.numberW + m.numberGap
  kinds.forEach((kind, index) => {
    const col = Math.floor(index / plan.rowsPerCol)
    const row = index % plan.rowsPerCol
    const colLeft = left + col * (plan.colWidth + m.gutter) + rowInset
    const rowTop = Math.round(top + row * rowH + extra / 2 + m.padY)
    const { label, hint } = FIF_BLANK_KINDS[kind]

    objects.push(
      buildText(
        {
          left: colLeft,
          top: rowTop,
          text: `${index + 1}.`,
          width: m.numberW,
          fontFamily: font,
          fontSize: m.font,
          fontWeight: 700,
          lineHeight: 1,
          textAlign: 'right',
        },
        tag,
        'decoration',
      ),
    )
    objects.push(
      buildText(
        {
          left: colLeft + labelLeft,
          top: rowTop,
          text: toNonBreakingSpaces(label),
          width: hugTextBoxWidth(label, m.font, m.labelW, boldSpec(font)),
          fontFamily: font,
          fontSize: m.font,
          fontWeight: 700,
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
    const hintTop = rowTop + fabricTextHeight(1, m.font) + m.hintGap
    objects.push(
      buildText(
        {
          left: colLeft + labelLeft,
          top: Math.round(hintTop),
          text: toNonBreakingSpaces(hint),
          width: hugTextBoxWidth(hint, m.hint, m.labelW, italicSpec(font)),
          fontFamily: font,
          fontSize: m.hint,
          fontStyle: 'italic',
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
    )
    // The writing line sits level with the foot of the hint, so a word
    // written on it has the label and the hint's height to itself.
    rule(
      objects,
      tag,
      colLeft + labelLeft + m.labelW + m.ruleGap,
      Math.round(hintTop + m.hint * FABRIC_FONT_SIZE_MULT) - 1,
      plan.ruleW,
    )
  })

  let footerTop = top + plan.rowsPerCol * rowH + m.footerGap
  for (const line of plan.footerLines) {
    centredText(objects, tag, {
      text: line,
      centre,
      top: footerTop,
      size: m.font,
      font,
      maxWidth: plan.blockWidth,
      italic: true,
    })
    footerTop += fabricLinePitch(m.font)
  }
}

function storyPageHeight(plan: StoryPagePlan, page: StoryPageLayout): number {
  const m = plan.metrics
  return (
    headingHeight(m.heading) +
    m.headingGap +
    (page.titleLines.length ? titleHeight(page.titleLines.length, m) : 0) +
    linesHeight(page.lines, m) +
    footerHeight(page.footer.length, m)
  )
}

/** Gaps a story page's leftover height can be spread into: heading, title, each line, footer. */
const storySpreadSlots = (page: StoryPageLayout) =>
  Math.max(0, page.lines.length - 1) + 2 + (page.titleLines.length ? 1 : 0)

/**
 * Extra height added to every line of a story, taken from its first page.
 *
 * A short story on a large trim would otherwise sit in the top half with the
 * bottom bare. Up to half the leftover goes into the line pitch — more room
 * above each blank for handwriting — capped so the text still reads as one
 * paragraph, not a list. Every page of the story uses the same figure, so a
 * continued story keeps one rhythm.
 */
export function storyLineExtra(field: Box, plan: StoryPagePlan, page: StoryPageLayout): number {
  const m = plan.metrics
  const slack = Math.max(0, field.height - plan.bottomGuard - storyPageHeight(plan, page))
  return Math.floor(Math.min((slack * 0.5) / storySpreadSlots(page), m.font * 0.35))
}

/**
 * One story page: heading, title (first page only), the story with its
 * numbered blanks, and "The End" or a note that the story continues.
 *
 * The opening page sits at the optical centre of its field; a continuation
 * page starts at the top, where the reader's eye lands after turning over.
 *
 * The title carries the book label (`studioContentLabel`), so a later run can
 * see this story and refuse to print it again.
 */
export function drawStoryPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: StoryPagePlan
    page: StoryPageLayout
    font: string
    tag: StudioTag
    label?: string
    /** From `storyLineExtra` on the story's first page. */
    lineExtra?: number
  },
): void {
  const { field, plan, page, font, tag, label } = options
  const m = plan.metrics
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  const centre = left + plan.blockWidth / 2
  const extra = options.lineExtra ?? storyLineExtra(field, plan, page)
  const spread = storyPageHeight(plan, page) + extra * storySpreadSlots(page)
  const slack = Math.max(0, field.height - plan.bottomGuard - spread)
  let top =
    field.top +
    (page.titleLines.length ? Math.round(slack * OPTICAL_TOP_SHARE) : Math.min(slack, m.font * 0.4))

  centredText(objects, tag, {
    text: page.heading,
    centre,
    top,
    size: m.heading,
    font,
    maxWidth: plan.blockWidth,
  })
  top += headingHeight(m.heading) + m.headingGap + extra

  if (page.titleLines.length) {
    const titleTop = top
    page.titleLines.forEach((line, index) => {
      const object = centredText(objects, tag, {
        text: line,
        centre,
        top: titleTop + index * fabricTextHeight(1, m.title) * TITLE_LINE_HEIGHT,
        size: m.title,
        font,
        maxWidth: plan.blockWidth,
        role: 'prompt',
      })
      if (index === 0 && label) object.data = { [STUDIO_CONTENT_LABEL_KEY]: label }
    })
    top += titleHeight(page.titleLines.length, m) + extra
  }

  const ruleDrop = Math.round(m.font * FABRIC_FONT_SIZE_MULT) - 2
  page.lines.forEach((line, index) => {
    if (index > 0) top += m.pitch + extra + (line.paragraphStart ? m.paraGap : 0)
    const lineTop = Math.round(top)
    const ruleY = lineTop + ruleDrop
    for (const piece of placeLine(line.atoms, m, font).pieces) {
      const x = Math.round(left + piece.left)
      if (piece.kind === 'text') {
        objects.push(
          buildText(
            {
              left: x,
              top: lineTop,
              text: toNonBreakingSpaces(piece.text),
              width: piece.width,
              fontFamily: font,
              fontSize: m.font,
              lineHeight: 1,
            },
            tag,
            'prompt',
          ),
        )
        continue
      }
      // The blank's number sits on the line, just before it, so the reader
      // copies word 3 onto the line marked 3.
      objects.push(
        buildText(
          {
            left: x,
            top: Math.round(ruleY - m.number * FABRIC_FONT_SIZE_MULT + 2),
            text: blankNumberText(piece.n),
            width: m.numberW,
            fontFamily: font,
            fontSize: m.number,
            fontWeight: 700,
            lineHeight: 1,
            textAlign: 'right',
          },
          tag,
          'decoration',
        ),
      )
      rule(objects, tag, x + m.numberW + m.numberGap, ruleY, m.blankW)
    }
  })

  let footerTop = top + fabricTextHeight(1, m.font) + m.footerGap + extra
  for (const line of page.footer) {
    centredText(objects, tag, {
      text: line,
      centre,
      top: footerTop,
      size: m.font,
      font,
      maxWidth: plan.blockWidth,
      italic: true,
    })
    footerTop += fabricLinePitch(m.font)
  }
}
