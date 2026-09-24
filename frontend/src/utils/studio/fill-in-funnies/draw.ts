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
 * breathes; anything still left goes under the footer.
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
  let top = field.top + Math.min(Math.max(0, slack - extra * (plan.rowsPerCol + 1)), m.font * 0.4)

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
    const colLeft = left + col * (plan.colWidth + m.gutter)
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

/**
 * One story page: heading, title (first page only), the story with its
 * numbered blanks, and "The End" or a note that the story continues.
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
  },
): void {
  const { field, plan, page, font, tag, label } = options
  const m = plan.metrics
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  const centre = left + plan.blockWidth / 2
  const natural =
    headingHeight(m.heading) +
    m.headingGap +
    (page.titleLines.length ? titleHeight(page.titleLines.length, m) : 0) +
    linesHeight(page.lines, m) +
    footerHeight(page.footer.length, m)
  const slack = Math.max(0, field.height - plan.bottomGuard - natural)
  let top = field.top + Math.min(slack, m.font * 0.4)

  centredText(objects, tag, {
    text: page.heading,
    centre,
    top,
    size: m.heading,
    font,
    maxWidth: plan.blockWidth,
  })
  top += headingHeight(m.heading) + m.headingGap

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
    top += titleHeight(page.titleLines.length, m)
  }

  const ruleDrop = Math.round(m.font * FABRIC_FONT_SIZE_MULT) - 2
  page.lines.forEach((line, index) => {
    if (index > 0) top += m.pitch + (line.paragraphStart ? m.paraGap : 0)
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

  let footerTop = top + fabricTextHeight(1, m.font) + m.footerGap
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
