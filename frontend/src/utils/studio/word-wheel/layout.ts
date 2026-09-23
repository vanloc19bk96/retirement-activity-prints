import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { measureHeaderHeight, type Box } from '../studio-layout'
import {
  ptToPx,
  pxToPt,
  wordSearchContentBox,
} from '../retirement-word-search/layout'
import {
  CENTER_LETTER_RATIO,
  OUTER_LETTER_RATIO,
  WHEEL_BAND_GAP,
  WHEEL_INK_PAD,
  minWordWheelListHeight,
  planWordWheelSlots,
  wheelBlockHeight,
  type WordWheelSlotPlan,
} from './draw'
import type { WordWheelLevel } from './levels'

/**
 * Everything a word wheel page decides on the seller's behalf.
 *
 * The page is one column holding three stacked blocks — a round wheel, nine
 * slots for the long word, and a block that is write-in lines on the puzzle and
 * an answer list on the solution. Only one of them has any give: the wheel is
 * square-ish and the letters in it are the whole reason an older reader can
 * solve this page at all, so its size is searched against a large-print floor
 * rather than handed a share of the column.
 *
 * None of it is on the form. "How wide should the wheel be" is not a question a
 * seller can answer without knowing the trim, the heading and how much room
 * nine ruled slots take; the page works it out and `wordWheelPrintNote` reports
 * what came out, so the form's help line and the printed page are the same
 * numbers.
 */

export { ptToPx, pxToPt }

/**
 * Large-print floor for the rim letters.
 *
 * Higher than the word search's fourteen point, and deliberately: a word search
 * prints a wall of letters that a reader scans, while a wheel prints nine that
 * a reader stares at for twenty minutes and holds in their head. These are the
 * largest letters in the library for that reason, and twenty point is where
 * they stop being.
 */
export const WHEEL_LETTER_MIN = ptToPx(20)

/** Smallest wheel that still prints its rim letters at the large-print floor. */
export const WHEEL_MIN_DIAMETER = Math.ceil(WHEEL_LETTER_MIN / OUTER_LETTER_RATIO)

/**
 * Widest a wheel is allowed to grow.
 *
 * Four inches across is a wheel a reader takes in without moving their head.
 * Past that an 8.5 x 11 interior spends its whole column on nine letters and
 * the page reads as a poster of a puzzle rather than as a puzzle — and the
 * blocks underneath, which is where the solving actually happens, get what is
 * left.
 */
export const WHEEL_MAX_DIAMETER = Math.round(DPI * 4)

/**
 * Most of the body column the wheel may take, top to bottom.
 *
 * Without it the wheel takes everything the band's floor does not need, and on
 * a 6 x 9 interior that came to nearly half the page — a handsome wheel over an
 * answer list squeezed to its smallest type with its caption dropped. The wheel
 * is the thing a reader looks at, but the blocks under it are where they
 * actually solve, and a page that gives the looking four fifths of its ink is
 * out of balance whichever block you measure first.
 */
const WHEEL_HEIGHT_SHARE = 0.48

/** Air between the nine slots and the block under them. */
export const SLOT_BLOCK_GAP = 20

/**
 * Air kept below the last ruled line.
 *
 * Without it the band takes the column to its last pixel and the bottom write-in
 * rule prints flush against the safe-area edge — inside the margin, and still
 * the first thing a seller squints at in the preview.
 */
const BAND_BOTTOM_GUARD = 18

export interface WordWheelPagePlan {
  /** Outer diameter of the wheel, ink excluded. */
  diameter: number
  outerLetterFont: number
  centerLetterFont: number
  slots: WordWheelSlotPlan
  /** Height both pages reserve under the wheel, slots included. */
  reservedBandHeight: number
}

/** The safe printable column every word wheel page lays out inside. */
export function wordWheelContentBox(page: StudioConfigLayoutContext): Box {
  return wordSearchContentBox(page)
}

/** What is left of the column once the title and instruction have been set. */
export function wordWheelBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = wordWheelContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * Resolve the wheel's size, its two letter sizes and the band reservation.
 *
 * The band is reserved at its floor first — nine slots, and a list of five rows
 * at the smallest large-print size — because both of those have to print
 * whatever else happens. The wheel takes what is left of the column, capped so
 * it cannot swallow a large trim, and then the band is given back everything
 * the wheel did not use, which is what lets a roomy page set its answer list
 * larger instead of leaving a hole between the blocks.
 *
 * The floor is measured from a row count rather than from a particular wheel's
 * answers on purpose: every page of one book then prints the same size wheel,
 * whichever nine letters it happens to carry.
 *
 * Returns null when the column cannot hold a wheel at large print — the form
 * says so before generate is ever pressed.
 */
export function planWordWheelPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
}): WordWheelPagePlan | null {
  const { page, config, instruction } = options
  const field = wordWheelBodyField(page, config, instruction)

  const slots = planWordWheelSlots(field.width)
  if (!slots) return null

  const bandFloor = slots.height + SLOT_BLOCK_GAP + minWordWheelListHeight()
  const span = Math.min(
    field.width,
    field.height * WHEEL_HEIGHT_SHARE,
    field.height - bandFloor - WHEEL_BAND_GAP,
  )
  const diameter = Math.min(WHEEL_MAX_DIAMETER, Math.floor(span - WHEEL_INK_PAD * 2))
  if (diameter < WHEEL_MIN_DIAMETER) return null

  const outerLetterFont = Math.max(
    WHEEL_LETTER_MIN,
    Math.round(diameter * OUTER_LETTER_RATIO),
  )
  return {
    diameter,
    outerLetterFont,
    // Never merely equal to the rim letters: the middle letter is a rule the
    // page states in type, and a rule set at the same size as what it governs
    // is a rule a reader reads straight past.
    centerLetterFont: Math.max(
      outerLetterFont + 2,
      Math.round(diameter * CENTER_LETTER_RATIO),
    ),
    slots,
    reservedBandHeight: Math.max(
      bandFloor,
      field.height - wheelBlockHeight(diameter) - WHEEL_BAND_GAP - BAND_BOTTOM_GUARD,
    ),
  }
}

export interface WordWheelPageBands {
  wheel: Box
  slots: Box
  /** Write-in lines on the puzzle page, the answer list on the solution. */
  work: Box
}

/**
 * Where each block sits in the body column.
 *
 * Both pages get the same three boxes, at the height the plan *reserved* rather
 * than the height this page's own block happened to measure — which is what
 * keeps the wheel and the nine slots in the same place on the puzzle and on its
 * answer page, so a reader checking a word is looking at the page they solved.
 *
 * The solution page's column is the taller of the two, because a key carries no
 * instruction line. That surplus goes above the stack, a third of it: hard
 * against the heading reads as a page that ran out of room, and dead centre
 * reads as a page floating away from it.
 */
export function wordWheelPageBands(field: Box, plan: WordWheelPagePlan): WordWheelPageBands {
  const wheelHeight = wheelBlockHeight(plan.diameter)
  const slack = Math.max(
    0,
    field.height - wheelHeight - WHEEL_BAND_GAP - plan.reservedBandHeight,
  )
  const top = field.top + Math.round(slack / 3)
  const slotsTop = top + wheelHeight + WHEEL_BAND_GAP
  const workTop = slotsTop + plan.slots.height + SLOT_BLOCK_GAP
  return {
    wheel: { left: field.left, top, width: field.width, height: wheelHeight },
    slots: {
      left: field.left,
      top: slotsTop,
      width: field.width,
      height: plan.slots.height,
    },
    work: {
      left: field.left,
      top: workTop,
      width: field.width,
      height: Math.max(0, top + wheelHeight + WHEEL_BAND_GAP + plan.reservedBandHeight - workTop),
    },
  }
}

/** Height the write-in lines or the answer list may occupy before they overrun. */
export function wordWheelWorkBudget(plan: WordWheelPagePlan): number {
  return Math.max(
    0,
    plan.reservedBandHeight - plan.slots.height - SLOT_BLOCK_GAP,
  )
}

/** What this level prints on the page size currently set in Settings. */
export function wordWheelPrintNote(
  level: WordWheelLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  const words =
    level.minWordLength === 5 ? 'Words run five letters or more' : 'Words run four letters or more'
  if (!page) {
    return `${words}, and one uses all nine. The answer page lists every word this wheel makes.`
  }

  // The level does not move the layout — the wheel is nine letters at every
  // level — so there is no gentler level to send a seller to. Only the page
  // size can fix this, and that is the only lever the message offers.
  const plan = planWordWheelPage({ page, config, instruction })
  if (!plan) {
    return (
      'This page size is too small for a word wheel — the letters would print below ' +
      'large-print size. Choose a larger page in Settings.'
    )
  }

  return (
    `${words}, and one uses all nine. ` +
    `Wheel letters print at ${pxToPt(plan.outerLetterFont)} pt, ` +
    `with an answer page listing every word.`
  )
}
