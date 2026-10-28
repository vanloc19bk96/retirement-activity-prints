import type { StudioConfigLayoutContext } from '@/types/studio-template.types'
import { boxBottom, boxRight, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { headingFits, plainSpec, wwContentBox } from '../well-wishes/layout'
import { AC_PROMPT_TEXTS, AC_SIGNOFF_TEXTS } from './content'
import {
  CARD_MIN_WIDTH,
  CARD_TITLE_FONT_MIN,
  LABEL_FONT_MIN,
  LINES_MIN,
  PITCH_MIN,
  PROMPT_MAX_LINES,
  SIGN_GAP,
  SIGN_LINE_MIN,
  cardLines,
  wrapPrompt,
  type AcCardHead,
  type AcPlan,
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
 * The last gate before a set of cards is considered export-ready.
 *
 * Fit is structural — the planner only makes cards that meet the minimums —
 * so this re-proves it, then checks what a guest or a reviewer would notice:
 * the wrong number of pages or cards, cards of different sizes on one page,
 * cards touching or leaving the printable area, a lopsided gap at the foot, a
 * prompt or sign-off that is not ours or does not fit its card, a prompt twice
 * on one page or next door, a heading squeezed below reading size, or type,
 * lines and signature room smaller than a handwritten keepsake needs.
 */
export function runAcKdpPreflight(options: {
  page: StudioConfigLayoutContext
  plan: AcPlan
  pages: number
  cardsPerPage: number
  head: AcCardHead
  prompts: readonly (readonly string[])[]
  signoff: string
  title: string
  /** Our own headings must fit at reading size; a seller's typed one may shrink. */
  generatedTitle: boolean
  font: string
}): KdpPreflightResult {
  const { page, plan, pages, cardsPerPage, head, prompts, signoff, title, generatedTitle, font } = options
  const errors: string[] = []
  const safe = wwContentBox(page)
  const { labelFont } = plan

  if (plan.pages.length !== pages) errors.push(`Expected ${pages} pages of cards, got ${plan.pages.length}.`)
  if (prompts.length !== plan.pages.length) errors.push('Every page needs its prompts.')
  if (labelFont < LABEL_FONT_MIN) errors.push('Prompts must stay large print.')
  if (head.title && head.titleFont < CARD_TITLE_FONT_MIN) errors.push('The card heading is too small to read.')
  if (!AC_SIGNOFF_TEXTS.has(signoff)) errors.push('The sign-off is not one of ours.')
  if (generatedTitle && !headingFits(title, safe.width, font)) {
    errors.push('The heading is too long to print at a readable size.')
  }

  const signWidth = hugTextBoxWidth(signoff, labelFont, Infinity, plainSpec(font))
  let previous = ''

  plan.pages.forEach((pagePlan, index) => {
    const where = `Page ${index + 1}`
    const { cards, field } = pagePlan
    const pagePrompts = prompts[index] ?? []
    if (cards.length !== cardsPerPage) errors.push(`${where} should hold ${cardsPerPage} cards, not ${cards.length}.`)
    if (pagePrompts.length !== cards.length) errors.push(`${where} has a card without a prompt.`)
    if (!inside(field, safe)) errors.push(`${where} lays out past the printable area.`)
    for (const cut of pagePlan.cuts) {
      const line = { left: cut.x1, top: cut.y1, width: cut.x2 - cut.x1, height: cut.y2 - cut.y1 }
      if (!inside(line, field)) errors.push(`${where}: a cut line leaves the printable area.`)
      if (cards.some((card) => overlaps(line, card.frame))) errors.push(`${where}: a cut line runs through a card.`)
    }

    const first = cards[0]
    cards.forEach((card, c) => {
      const { frame } = card
      if (!inside(frame, field)) errors.push(`${where}: a card leaves the printable area.`)
      if (first && (Math.abs(frame.width - first.frame.width) > 1 || Math.abs(frame.height - first.frame.height) > 1)) {
        errors.push(`${where}: cards must all be the same size.`)
      }
      for (let o = c + 1; o < cards.length; o++) {
        if (overlaps(frame, cards[o]!.frame)) errors.push(`${where}: two cards overlap.`)
      }
      if (frame.width < CARD_MIN_WIDTH) errors.push(`${where}: a card is too narrow to write in.`)
      if (card.pitch < PITCH_MIN - 0.5) errors.push(`${where}: writing lines are too close together.`)
      if (card.signY > boxBottom(frame) || (card.lines.at(-1) ?? card.signY) >= card.signY) {
        errors.push(`${where}: the signature line is out of place.`)
      }
      if (card.innerWidth - signWidth - SIGN_GAP < SIGN_LINE_MIN) errors.push(`${where}: the signature line is too short.`)

      const prompt = pagePrompts[c] ?? ''
      if (!AC_PROMPT_TEXTS.has(prompt)) {
        errors.push(`${where}: a prompt is missing or not one of ours.`)
      } else {
        const wrapped = wrapPrompt(prompt, labelFont, card.innerWidth, font)
        if (wrapped.length > PROMPT_MAX_LINES) errors.push(`${where}: “${prompt}” does not fit its card.`)
        if (cardLines(card, wrapped.length, labelFont).length < LINES_MIN) {
          errors.push(`${where}: a card has too few writing lines.`)
        }
      }
      if (prompt && (prompt === previous || pagePrompts.indexOf(prompt) !== c)) {
        errors.push(`${where}: “${prompt}” repeats too close to itself.`)
      }
      previous = prompt
    })

    // Cards stretch to fill the field; anything left at the foot is rounding.
    const lowest = Math.max(...cards.map((card) => boxBottom(card.frame)))
    if (cards.length > 0 && boxBottom(field) - lowest > pagePlan.rows + 2) {
      errors.push(`${where} leaves an empty band under the cards.`)
    }
  })

  return { ok: errors.length === 0, errors }
}
