import type { StudioConfigLayoutContext } from '@/types/studio-template.types'
import { boxBottom, boxRight, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { WW_PROMPT_TEXTS, WW_SIGNOFF_TEXTS } from './content'
import {
  BOX_MIN_WIDTH,
  LABEL_FONT_MIN,
  LINES_MIN,
  PITCH_MIN,
  SIGN_LINE_MIN,
  headingFits,
  italicSpec,
  plainSpec,
  promptRoom,
  signGap,
  wwContentBox,
  type WwPlan,
  type WwStyle,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

const overlaps = (a: Box, b: Box) =>
  a.left < boxRight(b) && b.left < boxRight(a) && a.top < boxBottom(b) && b.top < boxBottom(a)

const inside = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.top >= outer.top - 0.5 &&
  boxRight(inner) <= boxRight(outer) + 0.5 &&
  boxBottom(inner) <= boxBottom(outer) + 0.5

/**
 * The last gate before a set of pages is considered export-ready.
 *
 * Fit is structural — the planner only makes boxes that meet the minimums —
 * so this re-proves it, then checks what a signer or a reviewer would notice:
 * the wrong number of pages, a page without boxes, boxes of different sizes
 * on one page, boxes touching or leaving the printable area, a lopsided gap
 * at the foot, a prompt or sign-off that is not ours or does not fit its box,
 * a prompt twice on one page, a heading squeezed below reading size, or type,
 * lines and signature room smaller than a handwritten keepsake needs.
 */
export function runWwKdpPreflight(options: {
  page: StudioConfigLayoutContext
  plan: WwPlan
  pages: number
  style: WwStyle
  prompts: readonly (readonly string[])[]
  signoff: string
  titles: readonly string[]
  /** Our own headings must fit at reading size; a seller's typed one may shrink. */
  generatedTitles: boolean
  font: string
}): KdpPreflightResult {
  const { page, plan, pages, style, prompts, signoff, titles, generatedTitles, font } = options
  const errors: string[] = []
  const safe = wwContentBox(page)
  const { labelFont } = plan

  if (plan.pages.length !== pages) errors.push(`Expected ${pages} pages of boxes, got ${plan.pages.length}.`)
  if (prompts.length !== plan.pages.length) errors.push('Every page needs its prompts.')
  if (labelFont < LABEL_FONT_MIN) errors.push('Prompts must stay large print.')
  if (!WW_SIGNOFF_TEXTS.has(signoff)) errors.push('The sign-off is not one of ours.')

  const signWidth = hugTextBoxWidth(signoff, labelFont, Infinity, plainSpec(font))
  let previous = ''

  plan.pages.forEach((pagePlan, index) => {
    const where = `Page ${index + 1}`
    const { boxes, field } = pagePlan
    const pagePrompts = prompts[index] ?? []
    if (boxes.length === 0) errors.push(`${where} has no writing boxes.`)
    if (pagePrompts.length !== boxes.length) errors.push(`${where} has a box without a prompt.`)
    if (!inside(field, safe)) errors.push(`${where} lays out past the printable area.`)
    if (generatedTitles && !headingFits(titles[index] ?? '', safe.width, font)) {
      errors.push(`${where} heading is too long to print at a readable size.`)
    }

    const first = boxes[0]
    boxes.forEach((box, b) => {
      const { frame } = box
      if (!inside(frame, field)) errors.push(`${where}: a box leaves the printable area.`)
      if (first && (Math.abs(frame.width - first.frame.width) > 1 || Math.abs(frame.height - first.frame.height) > 1)) {
        errors.push(`${where}: boxes must all be the same size.`)
      }
      for (let o = b + 1; o < boxes.length; o++) {
        if (overlaps(frame, boxes[o]!.frame)) errors.push(`${where}: two boxes overlap.`)
      }
      if (frame.width < BOX_MIN_WIDTH) errors.push(`${where}: a box is too narrow to write in.`)
      if (box.lines.length < LINES_MIN) errors.push(`${where}: a box has too few writing lines.`)
      if (box.pitch < PITCH_MIN - 0.5) errors.push(`${where}: writing lines are too close together.`)
      if (box.signY > boxBottom(frame) || (box.lines.at(-1) ?? box.signY) >= box.signY) {
        errors.push(`${where}: the signature line is out of place.`)
      }
      if (box.innerWidth - signWidth - signGap < SIGN_LINE_MIN) errors.push(`${where}: the signature line is too short.`)

      const prompt = pagePrompts[b] ?? ''
      if (!WW_PROMPT_TEXTS.has(prompt)) errors.push(`${where}: a prompt is missing or not one of ours.`)
      else if (hugTextBoxWidth(prompt, labelFont, Infinity, italicSpec(font)) > promptRoom(box.innerWidth, style)) {
        errors.push(`${where}: “${prompt}” does not fit its box.`)
      }
      if (prompt && (prompt === previous || pagePrompts.indexOf(prompt) !== b)) {
        errors.push(`${where}: “${prompt}” repeats too close to itself.`)
      }
      previous = prompt
    })

    // Boxes stretch to fill the field; anything left at the foot is rounding.
    const lowest = Math.max(...boxes.map((box) => boxBottom(box.frame)))
    if (boxes.length > 0 && boxBottom(field) - lowest > pagePlan.rows + 2) {
      errors.push(`${where} leaves an empty band under the boxes.`)
    }
  })

  return { ok: errors.length === 0, errors }
}
