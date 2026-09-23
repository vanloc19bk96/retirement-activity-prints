import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import {
  LIST_CAPTION,
  drawWordWheel,
  drawWordWheelLines,
  drawWordWheelList,
  drawWordWheelSlots,
  planWordWheelLines,
  planWordWheelList,
  type WordWheelLinesPlan,
  type WordWheelListPlan,
} from './draw'
import type { WordWheelPuzzle } from './content'
import {
  wordWheelPageBands,
  wordWheelWorkBudget,
  type WordWheelPagePlan,
} from './layout'
import { wordWheelGoal, type WordWheelLevel } from './levels'

/**
 * The two pages this game prints, planned together.
 *
 * They have to be planned together because the number on the puzzle page is a
 * promise about the list on the solution page: "find at least fifteen words"
 * is only honest if the key can then show fifteen. So the solution's list is
 * fitted first, the goal is taken from what survived, and the puzzle page is
 * given at least that many lines to write on.
 */

export interface WordWheelSheet {
  /** The solution page's answer list — the words this book vouches for. */
  list: WordWheelListPlan
  /** The puzzle page's blank lines. */
  lines: WordWheelLinesPlan
  /** How many words the puzzle page asks for. Never more than the list holds. */
  goal: number
}

/**
 * How the puzzle page states its target.
 *
 * It repeats the one rule that matters, because the instruction strip can be
 * switched off and this caption cannot: a solver who misses the middle-letter
 * rule solves a different, much easier puzzle and then finds the answer page
 * disagreeing with every word they wrote.
 *
 * Broken where it means something rather than where the column runs out — the
 * target on one line, the rule on the next. Left to wrap, a 6 x 9 column put
 * the break after "middle" and left "letter" alone on a line of its own. A
 * narrower column still wraps these two further; it never drops either.
 */
export function goalCaption(goal: number): string {
  return `Find at least ${goal} words\nEvery word uses the middle letter`
}

/**
 * Fit both pages' lower blocks, or null when neither can be printed.
 *
 * Null is not a formality: a band too short for a single write-in line, or for
 * one word of the answer list, is a page that would print a wheel and nothing
 * to do with it. The caller answers with a message rather than that page.
 */
export function planWordWheelSheet(options: {
  plan: WordWheelPagePlan
  puzzle: WordWheelPuzzle
  level: WordWheelLevel
  bandWidth: number
  font: string
}): WordWheelSheet | null {
  const { plan, puzzle, level, bandWidth, font } = options
  const budget = wordWheelWorkBudget(plan)

  const list = planWordWheelList({
    words: puzzle.answers,
    bandWidth,
    maxHeight: budget,
    font,
    caption: LIST_CAPTION,
  })
  if (!list) return null

  // Planned once against the printed list, then clamped to the lines the page
  // really has: a sheet may not ask for more words than it leaves room to write.
  const wanted = wordWheelGoal(level, list.words.length)
  const planLines = (target: number) =>
    planWordWheelLines({
      bandWidth,
      maxHeight: budget,
      caption: goalCaption(target),
      font,
    })

  const lines = planLines(wanted)
  if (!lines) return null

  // Restated rather than patched: a smaller number can break over fewer lines,
  // and the block's height has to be the height of the caption it prints.
  const goal = Math.min(wanted, lines.capacity)
  if (goal === wanted) return { list, lines, goal }
  const restated = planLines(goal)
  return restated ? { list, lines: restated, goal } : { list, lines, goal }
}

/** Two wheels are the same puzzle when they share nine letters and a middle. */
export function wordWheelCanonicalKey(puzzle: WordWheelPuzzle): string {
  return `word-wheel:${puzzle.target}:${puzzle.center}`
}

interface PageOptions {
  field: Box
  plan: WordWheelPagePlan
  puzzle: WordWheelPuzzle
  sheet: WordWheelSheet
  level: WordWheelLevel
  font: string
  tag: StudioTag
}

/**
 * The wheel and the nine slots — same geometry on both pages.
 *
 * The solution tucks the revealed word into the rule group. The puzzle leaves
 * those letters beside it, still hidden, so the key can reveal them in place.
 */
function drawSharedBlocks(options: PageOptions, groupSlotLetters = false): {
  objects: StudioFabricObject[]
  work: Box
} {
  const { field, plan, puzzle, level, font, tag } = options
  const bands = wordWheelPageBands(field, plan)
  return {
    objects: [
      drawWordWheel({
        box: bands.wheel,
        geometry: {
          diameter: plan.diameter,
          outerLetterFont: plan.outerLetterFont,
          centerLetterFont: plan.centerLetterFont,
        },
        center: puzzle.center,
        outer: puzzle.outer,
        font,
        tag,
        canonicalKey: wordWheelCanonicalKey(puzzle),
      }),
      ...drawWordWheelSlots({
        area: bands.slots,
        plan: plan.slots,
        target: puzzle.target,
        font,
        tag,
        firstLetterGiven: level.firstLetterGiven,
        groupLettersWithRules: groupSlotLetters,
      }),
    ],
    work: bands.work,
  }
}

/** Centre a block of `height` in the box reserved for it. */
function centred(area: Box, height: number): Box {
  return {
    ...area,
    top: area.top + Math.max(0, Math.round((area.height - height) / 2)),
    height,
  }
}

export function drawWordWheelPuzzlePage(options: PageOptions): StudioFabricObject[] {
  const { sheet, font, tag } = options
  const shared = drawSharedBlocks(options)
  return [
    ...shared.objects,
    drawWordWheelLines({
      area: centred(shared.work, sheet.lines.height),
      plan: sheet.lines,
      font,
      tag,
    }),
  ]
}

export function drawWordWheelSolutionPage(options: PageOptions): StudioFabricObject[] {
  const { sheet, font, tag } = options
  const shared = drawSharedBlocks(options, true)
  return [
    ...shared.objects,
    drawWordWheelList({
      area: centred(shared.work, sheet.list.height),
      plan: sheet.list,
      caption: LIST_CAPTION,
      font,
      tag,
    }),
  ]
}
