import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  MIN_ITEMS_PER_PAGE,
  ICON_MIN,
  SLOT_MIN_W,
  iconBandWidth,
  slotBandWidth,
  type PictureRebusPagePlan,
} from './layout'
import {
  maxIconUsesPerPage,
  pictureRebusFaults,
  pictureRebusIconKey,
  type PictureRebusPuzzle,
} from './content'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a sheet is considered export-ready.
 *
 * Fit is already structural here — a row that would overrun its column never
 * gets planned, let alone drawn. What is left is the class of fault a reader
 * only discovers with a pencil in their hand, and every one of those is a
 * refund.
 *
 * This page can be wrong in three ways no other game here can, and none of them
 * shows in a preview.
 *
 * The pictures might not spell the answer printed under them. A reader who
 * cannot make SUN and FLOWER come to nine letters assumes they are missing
 * something, because the alternative — that the book is wrong — is not a
 * thought a solver has until the third page.
 *
 * The same two pictures might appear twice in one book with different answers,
 * which means at least one of those pages has an answer it cannot justify.
 *
 * And a picture might not draw at all. A name the icon catalog does not hold
 * throws inside Fabric mid-page, so the failure is not a missing drawing, it is
 * a blank sheet.
 *
 * Each is checked against the built page rather than trusted from the code that
 * built it.
 */
export function runPictureRebusKdpPreflight(options: {
  puzzles: readonly PictureRebusPuzzle[]
  plan: PictureRebusPagePlan
}): KdpPreflightResult {
  const { puzzles, plan } = options
  const warnings: string[] = []
  const errors: string[] = []

  /* --- every puzzle is a puzzle this book can stand behind ---------------- */

  if (puzzles.length === 0) {
    errors.push('This page has no picture puzzles to print.')
    return { ok: false, warnings, errors }
  }
  if (puzzles.length !== plan.itemCount) {
    errors.push('This page laid out room for a puzzle it does not have.')
  }
  if (puzzles.length < MIN_ITEMS_PER_PAGE) {
    errors.push('This page holds too few puzzles to be worth printing.')
  }

  for (const puzzle of puzzles) {
    const faults = pictureRebusFaults(puzzle)
    if (faults.length > 0) {
      errors.push(faults[0]!)
      break
    }
    if (isUnsafeCopy(puzzle.answer) || isUnsafeCopy(puzzle.hint)) {
      errors.push('A puzzle is not suitable for a published activity book.')
      break
    }
  }

  /* --- and no two of them are the same puzzle ----------------------------- */

  const answers = new Set<string>()
  const iconKeys = new Set<string>()
  let repeatedPicture = false
  const iconUses = new Map<string, number>()

  for (const puzzle of puzzles) {
    if (answers.has(puzzle.answer)) {
      errors.push('This page asks for the same answer twice.')
      break
    }
    answers.add(puzzle.answer)

    const key = pictureRebusIconKey(puzzle)
    if (iconKeys.has(key)) {
      errors.push('This page shows the same pair of pictures twice.')
      break
    }
    iconKeys.add(key)

    for (const icon of puzzle.icons) {
      const uses = (iconUses.get(icon.name) ?? 0) + 1
      iconUses.set(icon.name, uses)
      if (uses > maxIconUsesPerPage(puzzles.length)) repeatedPicture = true
    }
  }
  if (repeatedPicture) {
    warnings.push('One picture appears on this page more often than it should.')
  }

  /* --- the page it was laid out for is the page it prints on -------------- */

  const { metrics } = plan
  if (metrics.iconSize < ICON_MIN) {
    errors.push('The pictures are too small to be named at a glance.')
  }
  if (metrics.slotWidth < SLOT_MIN_W) {
    errors.push('The writing slots are narrower than a hand can write in.')
  }
  if (metrics.answerFont > metrics.slotWidth) {
    errors.push('A written answer letter would be wider than its own slot.')
  }
  for (const puzzle of puzzles) {
    if (iconBandWidth(puzzle.icons.length, metrics) > plan.bandWidth) {
      errors.push('A row of pictures is wider than the printable column.')
      break
    }
    if (slotBandWidth(puzzle.answer, metrics) > plan.bandWidth) {
      errors.push('An answer needs more slots than the printable column holds.')
      break
    }
  }

  return { ok: errors.length === 0, warnings, errors }
}
