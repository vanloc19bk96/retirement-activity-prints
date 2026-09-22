import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { measureHeaderHeight, type Box } from '../studio-layout'
import type { FontSpec } from '../studio-text-metrics'
import {
  ANSWER_STROKE_PAD,
  bankBandHeight,
  bankColumnInnerWidth,
  wordBankColumnCount,
} from '../retirement-word-search/draw'
import {
  BANK_MAX_FONT,
  BANK_MIN_FONT,
  CELL_MAX,
  CELL_MIN,
  LETTER_MIN,
  ptToPx,
  pxToPt,
  wordSearchContentBox,
} from '../retirement-word-search/layout'
import { worstBankEntryWidth } from './content'
import { HIDDEN_MESSAGE_LEVELS, type HiddenMessageLevel } from './levels'

/**
 * Everything a hidden-message page decides on the seller's behalf.
 *
 * Three blocks compete for one column here rather than the word search's two:
 * a square letter grid, a word bank, and a strip of write-in rules for the
 * saying. The old sheet resolved that with a `difficulty x printStyle` lookup
 * table that never saw the trim — the same 13 x 13 grid went onto a 5 x 8
 * interior and onto 8.5 x 11 — and then shared out the leftover height by
 * percentage, which is how the write-in rules took a sixth of the page whether
 * the saying was eighteen letters or thirty-two.
 *
 * The large-print floors below are imported from the plain word search, not
 * restated. Two word searches facing each other in one book that disagree about
 * what 14 pt means is a worse fault than either of them getting it wrong alone.
 *
 * One rule shapes the rest: a hidden-message grid is filled *exactly*. Every
 * cell holds either a listed word's letter or one of the saying's, so the word
 * count is not a preference — it is whatever the grid area minus the saying
 * comes to. That makes the bank's height a function of the grid's, which is why
 * the search below walks grid sizes rather than word counts.
 */

export { BANK_MAX_FONT, BANK_MIN_FONT, CELL_MAX, CELL_MIN, LETTER_MIN, ptToPx, pxToPt }

/** Letter height as a share of the cell pitch — matches the plain word search. */
const LETTER_RATIO = 0.66

/**
 * Write-in slot floor and ceiling, in canvas pixels.
 *
 * The floor is a hand width, not a type size: unlike the grid, the solver
 * writes into these. Much under a fifth of an inch and an older hand cannot put
 * a capital between two rules without touching the one beside it. The ceiling
 * is where a thirty-letter saying stops fitting two lines on any trim this app
 * supports, and a three-line answer strip reads as a form to fill in.
 */
export const MESSAGE_SLOT_MIN = ptToPx(16)
export const MESSAGE_SLOT_MAX = ptToPx(25)

/** Width of the rule under one slot, as a share of the slot. */
const RULE_WIDTH_RATIO = 0.9
/** Line pitch of the write-in strip, as a share of the slot width. */
const MESSAGE_LINE_RATIO = 1.7
/** Visible break between two words of the saying, as a share of the slot. */
const MESSAGE_WORD_GAP_RATIO = 0.55
/** Most lines the write-in strip may take before it stops reading as an answer. */
const MESSAGE_MAX_LINES = 3

/**
 * The caption over the writing rules, and the room it takes.
 *
 * A strip of blank rules under a word bank is not self-explanatory to someone
 * meeting this puzzle for the first time, and the audience for a retirement
 * activity book meets it for the first time most of the time. The instruction
 * at the top of the page says what to do; this says where to do it, at the
 * moment the solver is looking for somewhere to write.
 */
export const MESSAGE_LABEL = 'Hidden message:'
export const MESSAGE_LABEL_SIZE = ptToPx(12)
const MESSAGE_LABEL_GAP = 8

/** Air between the three stacked blocks. */
export const BAND_GAP = 18

/**
 * Below eight cells a side there is no room to interlock a publishable word
 * list around a saying; above fourteen the bank needed to fill the grid exactly
 * runs longer than a large-print page can print.
 *
 * Eight is the floor rather than nine because of one trim. A 5 x 8 interior at
 * 14 pt has room for a grid, a bank and a strip of writing rules only if the
 * grid is eight cells across — and 5 x 8 is a size sellers on the entry plan
 * can actually pick. A thin gentle page there beats a refusal.
 */
export const GRID_MIN_SIDE = 8
export const GRID_MAX_SIDE = 14

/**
 * Cells one listed word is assumed to claim, for the purpose of reserving room.
 *
 * Deliberately pessimistic — barely above the shortest word the levels allow.
 * The placer writes longest-first and takes the highest-consuming placement it
 * can find, so the real average runs well above this. But the bank is reserved
 * from this number, and a bank reserved from an optimistic average is a bank
 * whose last row prints on top of the write-in rules.
 */
const WORD_CELLS = 5

export interface MessageBandPlan {
  /** Width of one write-in slot — one letter of the saying. */
  slot: number
  wordGap: number
  lineHeight: number
  lines: number
  ruleWidth: number
  /**
   * Whether the caption prints.
   *
   * It is the first thing given up when a trim runs out of height, because a
   * page that drops the caption is still solvable from the instruction, while a
   * page that drops a line of rules has nowhere to write half the answer.
   */
  labelled: boolean
}

export interface HiddenMessagePagePlan {
  /** Cells a side. */
  gridSide: number
  /** Letter pitch, in canvas pixels. */
  cell: number
  /** Size the grid letters print at. */
  letterFont: number
  /**
   * Most words this page may list.
   *
   * A budget, not a target: the placer stops the moment the free cells match
   * the saying's length, and it may never exceed this or the bank it was
   * reserved for would not hold the result.
   */
  maxWords: number
  bank: { columns: number; rows: number; minFont: number }
  /** Reserved at the floor slot width, for the longest saying this level allows. */
  message: MessageBandPlan
  /** Longest a listed word may be on this page (cannot exceed the grid). */
  maxWordLetters: number
  /** Widest a bank entry may print before Fabric would wrap it. */
  maxEntryWidth: number
}

export function messageLineHeight(slot: number): number {
  return Math.max(Math.round(slot * MESSAGE_LINE_RATIO), slot + 8)
}

export function messageWordGap(slot: number): number {
  return Math.round(slot * MESSAGE_WORD_GAP_RATIO)
}

export function messageRuleWidth(slot: number): number {
  return Math.round(slot * RULE_WIDTH_RATIO)
}

/**
 * Wrap the saying's words onto write-in lines, the way the page draws them.
 *
 * Shared by the reservation and by the drawing code, so a strip reserved for
 * two lines cannot be painted with three.
 */
export function wrapMessageLines(
  boxWords: readonly string[],
  slot: number,
  width: number,
): string[][] {
  const gap = messageWordGap(slot)
  const lines: string[][] = []
  let current: string[] = []
  let used = 0

  for (const word of boxWords) {
    const wordWidth = word.length * slot
    const next = current.length === 0 ? wordWidth : used + gap + wordWidth
    if (current.length > 0 && next > width) {
      lines.push(current)
      current = [word]
      used = wordWidth
      continue
    }
    current.push(word)
    used = next
  }
  if (current.length > 0) lines.push(current)
  return lines
}

/**
 * Slack added to the reserved width before lines are counted.
 *
 * The page reserves write-in room before a single word of the saying exists, so
 * it reserves against a synthetic one: the level's longest saying broken into
 * four-letter words, which pays for more word gaps than English does. The
 * margin on top covers the one thing the synthetic cannot model — a long word
 * that will not fit the tail of a line and pushes the whole run onto the next.
 */
const MESSAGE_RESERVE_SLACK = 1.15

/** A saying shaped like the worst one this level could be handed. */
function worstMessageWords(level: HiddenMessageLevel): string[] {
  const words: string[] = []
  let left = level.maxMessageLetters
  while (left > 0) {
    const take = Math.min(4, left)
    words.push('M'.repeat(take))
    left -= take
  }
  return words
}

/** Lines the strip must hold for the longest saying this level allows. */
export function reserveMessageBand(
  level: HiddenMessageLevel,
  width: number,
  options: { slot?: number; labelled?: boolean } = {},
): MessageBandPlan | null {
  const slot = options.slot ?? MESSAGE_SLOT_MIN
  const words = worstMessageWords(level)
  const gap = messageWordGap(slot)
  const run = level.maxMessageLetters * slot + Math.max(0, words.length - 1) * gap
  const lines = Math.max(1, Math.ceil((run * MESSAGE_RESERVE_SLACK) / Math.max(1, width)))
  if (lines > MESSAGE_MAX_LINES) return null
  // One word of the saying still has to fit a line on its own. A saying word
  // can be longer than a grid word, so this is measured generously.
  if (Math.min(level.maxMessageLetters, 12) * slot > width) return null
  return {
    slot,
    wordGap: gap,
    lineHeight: messageLineHeight(slot),
    lines,
    ruleWidth: messageRuleWidth(slot),
    labelled: options.labelled ?? true,
  }
}

/** Height the caption claims above the rules, or zero when there is no room. */
export function messageLabelHeight(withLabel: boolean): number {
  return withLabel ? MESSAGE_LABEL_SIZE + MESSAGE_LABEL_GAP : 0
}

export function messageBandHeight(band: MessageBandPlan): number {
  return band.lines * band.lineHeight + messageLabelHeight(band.labelled)
}

function bankFontSpec(config: StudioConfig): FontSpec {
  return {
    fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
    fontWeight: 'normal',
  }
}

/**
 * Columns the bank holds once the widest admissible entry is accounted for.
 *
 * `wordBankColumnCount` only looks at how many words there are. A nine-letter
 * entry still has to fit its column on one line, so columns are given up until
 * it provably does — the same walk `drawWordList` makes with the real words.
 */
function bankColumnsFor(
  wordCount: number,
  bandWidth: number,
  worstEntryWidth: number,
): number {
  let colCount = Math.min(wordBankColumnCount(wordCount), Math.max(1, wordCount))
  while (colCount > 1 && bankColumnInnerWidth(bandWidth, colCount) < worstEntryWidth) {
    colCount -= 1
  }
  return colCount
}

/** The safe printable column every hidden-message page lays out inside. */
export function hiddenMessageContentBox(page: StudioConfigLayoutContext): Box {
  return wordSearchContentBox(page)
}

/** What is left of the column once the title and instruction have been set. */
export function hiddenMessageBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = hiddenMessageContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * Resolve grid size, word budget and type sizes for one page.
 *
 * Walks grid sizes downwards; the largest one whose grid, bank and write-in
 * strip all set at their large-print floors wins. Grid size is the right lever
 * because every other number follows from it: the word budget is the grid's
 * free cells over `WORD_CELLS`, and the bank's height follows from that.
 *
 * Nothing here depends on the saying or the words, neither of which has been
 * written yet — both are reserved at their level's worst case. That is what
 * lets the form promise a grid size before generate is pressed, and it is what
 * stops a long saying from pushing the bank off the bottom of the page.
 *
 * Returns null when even the smallest grid will not fit. A 5 x 8 interior with
 * a three-line instruction genuinely cannot carry three stacked blocks at
 * 14 pt, and saying so is better than printing a squint.
 */
export function planHiddenMessagePage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: HiddenMessageLevel
}): HiddenMessagePagePlan | null {
  const { page, config, instruction, level } = options
  const field = hiddenMessageBodyField(page, config, instruction)
  const spec = bankFontSpec(config)
  const worstEntry = worstBankEntryWidth(level.maxLetters, BANK_MIN_FONT, spec)

  // The caption is the cheapest thing to give up, so it is given up last:
  // every grid size is tried with it before any is tried without.
  for (const labelled of [true, false]) {
    const plan = planAtLabelling({ field, level, worstEntry, labelled })
    if (plan) return plan
  }
  return null
}

function planAtLabelling(options: {
  field: Box
  level: HiddenMessageLevel
  /** Widest entry the bank could be asked to hold, at the large-print floor. */
  worstEntry: number
  labelled: boolean
}): HiddenMessagePagePlan | null {
  const { field, level, worstEntry, labelled } = options
  const message = reserveMessageBand(level, field.width, { labelled })
  if (!message) return null
  const messageHeight = messageBandHeight(message)

  for (let side = GRID_MAX_SIDE; side >= GRID_MIN_SIDE; side--) {
    // A word cannot be longer than the grid is wide, whatever the level says.
    const maxWordLetters = Math.min(level.maxLetters, side)
    if (maxWordLetters < level.minLetters) continue

    // Worst case is the shortest saying the level allows: the fewer cells the
    // saying claims, the more the words must, and the longer the bank runs.
    const wordCells = side * side - level.minMessageLetters
    if (wordCells < level.minWords * level.minLetters) continue
    const maxWords = Math.ceil(wordCells / WORD_CELLS)
    if (maxWords > level.maxWords) continue
    // Headroom, not just room. A grid whose budget sits exactly on the level's
    // floor gives the packer one arrangement to find and no second chance at
    // it, which is an error page waiting for the first stubborn saying.
    if (maxWords < level.minWords + 2) continue

    const columns = bankColumnsFor(maxWords, field.width, worstEntry)
    const rows = Math.ceil(maxWords / columns)
    const bankHeight = bankBandHeight(rows, BANK_MIN_FONT)

    // The grid is square, so its side is bounded by the narrower of what the
    // column leaves across and what the other two blocks leave down.
    const gridSpan = Math.min(
      field.width,
      field.height - bankHeight - messageHeight - BAND_GAP * 2,
    )
    const usable = gridSpan - ANSWER_STROKE_PAD * 2
    if (usable < side * CELL_MIN) continue

    const cell = Math.min(CELL_MAX, Math.floor(usable / side))
    if (cell < CELL_MIN) continue

    return {
      gridSide: side,
      cell,
      letterFont: Math.max(LETTER_MIN, Math.round(cell * LETTER_RATIO)),
      maxWords,
      bank: { columns, rows, minFont: BANK_MIN_FONT },
      message,
      maxWordLetters,
      maxEntryWidth: bankColumnInnerWidth(field.width, columns),
    }
  }

  return null
}

export interface HiddenMessagePageBands {
  grid: Box
  bank: Box
  message: Box
}

export function planGridHeight(plan: HiddenMessagePagePlan): number {
  return plan.cell * plan.gridSide + ANSWER_STROKE_PAD * 2
}

/**
 * Where the three blocks actually sit in the body column.
 *
 * The grid takes exactly the square the plan sized it to. What is left after
 * the two floors are met is spent on type rather than on air: the write-in
 * slots widen first, up to their ceiling, then the bank's band grows so
 * `drawWordList` can set the words larger. Only what neither can use becomes
 * space, and it goes a third above the stack — hard against the instruction
 * reads as a page that ran out of room, dead centre reads as a page floating
 * away from its heading.
 */
export function hiddenMessagePageBands(
  field: Box,
  plan: HiddenMessagePagePlan,
): HiddenMessagePageBands {
  const gridHeight = planGridHeight(plan)
  const minBank = bankBandHeight(plan.bank.rows, plan.bank.minFont)
  const maxBank = bankBandHeight(plan.bank.rows, BANK_MAX_FONT)
  const minMessage = messageBandHeight(plan.message)
  const maxMessage =
    plan.message.lines * messageLineHeight(MESSAGE_SLOT_MAX) +
    messageLabelHeight(plan.message.labelled)

  let slack = Math.max(0, field.height - gridHeight - BAND_GAP * 2 - minBank - minMessage)
  const toMessage = Math.min(Math.max(0, maxMessage - minMessage), Math.round(slack * 0.4))
  slack -= toMessage
  const toBank = Math.min(Math.max(0, maxBank - minBank), slack)
  slack -= toBank

  const messageHeight = minMessage + toMessage
  const bankHeight = minBank + toBank
  const top = field.top + Math.round(slack / 3)

  const grid: Box = { left: field.left, top, width: field.width, height: gridHeight }
  const bank: Box = {
    left: field.left,
    top: grid.top + gridHeight + BAND_GAP,
    width: field.width,
    height: bankHeight,
  }
  const message: Box = {
    left: field.left,
    top: bank.top + bankHeight + BAND_GAP,
    width: field.width,
    height: messageHeight,
  }
  return { grid, bank, message }
}

/**
 * Solution page: the same grid, plus the saying set as plain text below it.
 *
 * The bank is not reprinted — a key that repeats the word list adds nothing a
 * reader needs and costs the circles the room to be seen. The saying has to be
 * there, though, because half of what the solver was asked for was the saying.
 */
export function hiddenMessageSolutionBands(
  field: Box,
  plan: HiddenMessagePagePlan,
): { grid: Box; message: Box } {
  const gridHeight = planGridHeight(plan)
  const messageHeight = Math.max(
    0,
    Math.min(
      Math.max(messageLineHeight(MESSAGE_SLOT_MAX), Math.round(field.height * 0.16)),
      Math.max(0, field.height - gridHeight - BAND_GAP),
    ),
  )
  const slack = Math.max(0, field.height - gridHeight - BAND_GAP - messageHeight)
  const top = field.top + Math.round(slack / 2)
  return {
    grid: { left: field.left, top, width: field.width, height: gridHeight },
    message: {
      left: field.left,
      top: top + gridHeight + BAND_GAP,
      width: field.width,
      height: messageHeight,
    },
  }
}

/** True when some easier level lays out on this page, and this one does not. */
function gentlerLevelFits(
  level: HiddenMessageLevel,
  page: StudioConfigLayoutContext,
  config: StudioConfig,
): boolean {
  const index = HIDDEN_MESSAGE_LEVELS.indexOf(level)
  return HIDDEN_MESSAGE_LEVELS.slice(0, Math.max(0, index)).some((gentler) =>
    planHiddenMessagePage({
      page,
      config,
      instruction: gentler.instruction,
      level: gentler,
    }),
  )
}

/** What this level prints on the page size currently set in Settings. */
export function hiddenMessagePrintNote(
  level: HiddenMessageLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return (
      `Up to ${level.maxWords} words hiding a ` +
      `${level.minMessageLetters}–${level.maxMessageLetters} letter saying, ` +
      'plus a matching answer page.'
    )
  }

  const plan = planHiddenMessagePage({ page, config, instruction, level })
  if (!plan) {
    // Only offer the lever that actually works. On a 5 x 8 interior no level
    // fits, and telling a seller to try a gentler one sends them round a loop
    // that ends where it started.
    return gentlerLevelFits(level, page, config)
      ? 'This page size is too small for this level — choose a gentler level, or a larger page in Settings.'
      : 'This page size is too small for a hidden message word search — choose a larger page in Settings.'
  }

  return (
    `A ${plan.gridSide} × ${plan.gridSide} grid with up to ${plan.maxWords} words, ` +
    `letters at ${pxToPt(plan.letterFont)} pt, hiding a ` +
    `${level.minMessageLetters}–${level.maxMessageLetters} letter saying. ` +
    'Includes a matching answer page.'
  )
}
