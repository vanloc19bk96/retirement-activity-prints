import { measureRunWidth, type FontSpec } from '../studio-text-metrics'
import {
  BINGO_MOMENT_COUNT,
  RETIREMENT_BINGO_FREE_TEXT,
  momentKey,
  retirementBingoMomentFaults,
  type RetirementBingoMoment,
} from './content'
import {
  CELL_MIN,
  PHRASE_FONT_MIN,
  PHRASE_MAX_LINES,
  phraseBlockHeight,
  type RetirementBingoPagePlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a card is considered export-ready.
 *
 * A bingo card can fail in ways a preview hides: two squares saying the same
 * thing in different words, a phrase that wrapped onto a fourth line and now
 * touches the rule, a moment that repeats the free square. Each of those is a
 * reader crossing off one moment twice, or squinting, and none of them is
 * obvious until the proof copy.
 *
 * Checked against the card as built, not trusted from the code that built it.
 */
export function runRetirementBingoKdpPreflight(options: {
  moments: readonly RetirementBingoMoment[]
  plan: RetirementBingoPagePlan
  font: string
}): KdpPreflightResult {
  const { moments, plan, font } = options
  const warnings: string[] = []
  const errors: string[] = []
  const spec: FontSpec = { fontFamily: font }

  /* --- a full card, around a free centre ---------------------------------- */

  if (moments.length !== BINGO_MOMENT_COUNT) {
    errors.push(`This card has ${moments.length} moments; a bingo card needs 24.`)
    return { ok: false, warnings, errors }
  }

  /* --- every square is a square this book can stand behind ---------------- */

  for (const moment of moments) {
    const faults = retirementBingoMomentFaults(moment)
    if (faults.length > 0) {
      errors.push(faults[0]!)
      break
    }
  }

  /* --- and no two of them are the same moment ----------------------------- */

  const texts = new Set<string>()
  const families = new Set<string>()
  for (const moment of moments) {
    const key = momentKey(moment.text)
    if (key === momentKey(RETIREMENT_BINGO_FREE_TEXT)) {
      errors.push('A square repeats the free NAP square.')
      break
    }
    if (texts.has(key)) {
      errors.push(`"${moment.text}" appears on this card twice.`)
      break
    }
    if (families.has(moment.family)) {
      errors.push(`"${moment.text}" repeats another square in different words.`)
      break
    }
    texts.add(key)
    families.add(moment.family)
  }

  /* --- every phrase fits its square at the planned size ------------------- */

  const { metrics, phraseFont } = plan
  if (metrics.cell < CELL_MIN) {
    errors.push('The squares are too small to read comfortably.')
  }
  if (phraseFont < PHRASE_FONT_MIN) {
    errors.push('The phrases would print below a comfortable reading size.')
  }
  for (const moment of moments) {
    const lines = plan.lines.get(moment.text)
    if (!lines) {
      errors.push(`"${moment.text}" does not fit a square on this page size.`)
      break
    }
    if (lines.join(' ') !== moment.text) {
      errors.push(`"${moment.text}" would print with words missing.`)
      break
    }
    if (lines.length > PHRASE_MAX_LINES) {
      errors.push(`"${moment.text}" needs more lines than a square holds.`)
      break
    }
    if (lines.some((line) => measureRunWidth(line, phraseFont, spec) > metrics.fitWidth)) {
      errors.push(`"${moment.text}" is wider than its square.`)
      break
    }
    if (phraseBlockHeight(lines.length, phraseFont) > metrics.maxTextHeight) {
      errors.push(`"${moment.text}" is taller than its square.`)
      break
    }
  }

  /* --- a soft note when one group has taken over the card ----------------- */

  const perGroup = new Map<string, number>()
  for (const moment of moments) {
    perGroup.set(moment.group, (perGroup.get(moment.group) ?? 0) + 1)
  }
  if (perGroup.size > 1 && Math.max(...perGroup.values()) > BINGO_MOMENT_COUNT / 2) {
    warnings.push('Most of this card comes from one kind of moment.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
