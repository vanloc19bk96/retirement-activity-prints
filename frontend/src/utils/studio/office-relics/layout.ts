import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, measureRunWidth, wrapSafeWidth, wrapTextToWidth, type FontSpec } from '../studio-text-metrics'
import { OFFICE_RELICS, aliasLine, levelSpec, type OfficeRelicsLevel } from './content'
import { OR_NUMBER_STYLES, orNumberLabel } from './style'

/**
 * Everything an Office Relics page decides on the seller's behalf.
 *
 * A page is a grid of equal cards. Each card is a picture box over a numbered
 * writing line; on the answer page the card grows by a line or two, where the
 * object's other accepted names are printed under the answer. Nothing on the
 * form asks how many pictures a page holds or how big they print — neither is
 * answerable without the trim, the heading and the longest answer in the
 * catalog — so the page works it out and the form's help line reports it.
 *
 * The governing number is the **picture box**. A grid is only considered when
 * every box is at least `PICTURE_MIN` — the size at which the busiest drawing
 * (a typewriter's keys, a slide rule's scale) still reads after print — and the
 * planner prefers a comfortable size over one more picture: a letter page holds
 * nine, a 6 x 9 six, a 5 x 8 four. Fewer, larger, clearer.
 *
 * The plan is fixed before any object is chosen, from the catalog's worst case
 * (its longest name, its longest alias line), so every page of a run prints its
 * pictures at one size, and a page can never be dealt an object that does not
 * fit its line. Both pages must fit: the puzzle page with its instruction (and
 * word bank, on the gentle level), and the answer page with its alias lines.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
const inch = (value: number) => Math.round(value * DPI)
export const pxToIn = (px: number) => Math.round((px / DPI) * 10) / 10

/** Smallest picture box, either way. Below this the busiest drawings smudge. */
export const PICTURE_MIN_W = inch(1.4)
export const PICTURE_MIN_H = inch(1.05)
/** Tried first: a size nobody leans in to read. */
const PICTURE_COMFORT_W = inch(1.7)
const PICTURE_COMFORT_H = inch(1.25)
/** Past this a picture is a poster; spare height goes to the gaps instead. */
const PICTURE_MAX_H = inch(2.3)
/** Cards wider than this leave a picture floating in white; the grid is centred instead. */
const CARD_MAX_W = inch(3.2)

/** Nine is a full, calm page; more would shrink every picture for one extra. */
export const MAX_ITEMS_PER_PAGE = 9
/** Fewer than four and the page is mostly heading. */
export const MIN_ITEMS_PER_PAGE = 4

const COL_GAP = inch(0.2)
const ROW_GAP = inch(0.18)
/** Inside a card, between its frame and what it holds. */
export const CARD_PAD = inch(0.1)
export const CARD_RADIUS = inch(0.08)
/** Between the picture and the writing line under it. */
export const PICTURE_TO_LINE = inch(0.1)
/** Height above the line for a handwritten answer, measured from a hand. */
const WRITE_ROOM_MIN = inch(0.36)
export const RULE_HEIGHT = 2
/** The written answer sits just off its line, the way a hand writes. */
export const ANSWER_LIFT = inch(0.04)
/** The key's answer starts a little in from the start of its line. */
export const ANSWER_INSET = inch(0.05)

export const NUMBER_FONT = ptToPx(15)
/** The answer as the key prints it on the line. */
const ANSWER_FONT_MAX = ptToPx(16)
export const ANSWER_FONT_MIN = ptToPx(13)
/**
 * A long name on a narrow card ("Overhead projector" on a 5 x 8) may take two
 * lines on the answer page. The writing room above the line is then sized for
 * two, which also gives a reader more room for their own handwriting.
 */
export const MAX_ANSWER_LINES = 2
export const ANSWER_LINE_HEIGHT = 1
/** "Also: …" under an answer. */
export const ALIAS_FONT_MIN = ptToPx(11)
export const ALIAS_LINE_HEIGHT = 1.15
export const MAX_ALIAS_LINES = 2
export const ALIAS_GAP = inch(0.05)

/** Word bank type and air. */
export const BANK_FONT = ptToPx(14)
export const BANK_LABEL_FONT = ptToPx(11)
export const BANK_LINE_HEIGHT = 1.3
export const BANK_PAD = inch(0.1)
/** Air between the grid and the word bank. */
export const BANK_GAP = inch(0.22)
/** Space either side of the dot between two words in the bank. */
export const BANK_SEPARATOR = '   •   '

export const numberSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const answerSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const aliasSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })
export const bankSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface OrPagePlan {
  columns: number
  rows: number
  count: number
  cardWidth: number
  /** Card height on the puzzle page. */
  cardHeight: number
  /** Card height on the answer page, with room for alias lines. */
  answerCardHeight: number
  pictureWidth: number
  pictureHeight: number
  /** Width of the number column, left of the writing line. */
  numberWidth: number
  /** Height reserved above the line for handwriting. */
  writeRoom: number
  answerFont: number
  /** Most lines any answer in the catalog takes at this size (1 or 2). */
  answerLines: number
  aliasFont: number
  /** Outline and detail weights for every picture on the page. */
  stroke: number
  fineStroke: number
  /** Height of the word bank block (0 when the level has none). */
  bankHeight: number
  /** Lines the word bank's worst case needs. */
  bankLines: number
}

/** Width of the writing line inside a card. */
export const lineWidth = (plan: Pick<OrPagePlan, 'cardWidth' | 'numberWidth'>) =>
  plan.cardWidth - CARD_PAD * 2 - plan.numberWidth

const gridWidth = (plan: Pick<OrPagePlan, 'columns' | 'cardWidth'>) =>
  plan.columns * plan.cardWidth + (plan.columns - 1) * COL_GAP
export const orGridWidth = gridWidth
export const orColGap = COL_GAP
export const orRowGap = ROW_GAP

/** The aliases a card has room for, in order: each is kept only if the block still fits. */
export function fittingAliases(aliases: readonly string[], width: number, size: number, font: string): string[] {
  const spec = aliasSpec(font)
  const safe = wrapSafeWidth(width, spec)
  const kept: string[] = []
  for (const alias of aliases) {
    const lines = wrapTextToWidth(aliasLine([...kept, alias]), size, safe, spec)
    if (lines.length <= MAX_ALIAS_LINES) kept.push(alias)
  }
  return kept
}

/** The "Also: …" block under an answer, broken to the answer column; [] when none fits. */
export function breakAliases(aliases: readonly string[], width: number, size: number, font: string): string[] {
  const kept = fittingAliases(aliases, width, size, font)
  if (kept.length === 0) return []
  const spec = aliasSpec(font)
  return wrapTextToWidth(aliasLine(kept), size, wrapSafeWidth(width, spec), spec)
}

/** Pack names into lines for the word bank; a name never breaks across lines. */
export function packBank(names: readonly string[], width: number, font: string): string[] {
  const spec = bankSpec(font)
  const safe = wrapSafeWidth(width, spec)
  const lines: string[] = []
  let current = ''
  for (const name of names) {
    const next = current ? `${current}${BANK_SEPARATOR}${name}` : name
    if (current && measureRunWidth(next, BANK_FONT, spec) > safe) {
      lines.push(current)
      current = name
    } else current = next
  }
  if (current) lines.push(current)
  return lines
}

export function bankBlockHeight(lines: number): number {
  if (lines === 0) return 0
  return (
    BANK_PAD * 2 +
    fabricTextHeight(1, BANK_LABEL_FONT) +
    Math.round(BANK_PAD * 0.6) +
    fabricTextHeight(lines, BANK_FONT, BANK_LINE_HEIGHT)
  )
}

/** An answer as the key sets it on its line: one line, or two when the card is narrow. */
export function breakAnswer(name: string, width: number, size: number, font: string): string[] {
  const spec = answerSpec(font)
  return wrapTextToWidth(name, size, wrapSafeWidth(width, spec), spec)
}

/**
 * The answer size for this line width: the largest at which every name in the
 * catalog sits on one line; failing that, the size that leaves the fewest
 * names on two lines (a narrow card), larger breaking ties.
 */
function answerFontFor(width: number, font: string): { size: number; lines: number } | null {
  let best: { size: number; lines: number; wrapped: number } | null = null
  for (let size = ANSWER_FONT_MAX; size >= ANSWER_FONT_MIN; size--) {
    const counts = OFFICE_RELICS.map((r) => breakAnswer(r.name, width, size, font).length)
    const lines = Math.max(...counts)
    if (lines === 1) return { size, lines }
    if (lines > MAX_ANSWER_LINES) continue
    const wrapped = counts.filter((n) => n > 1).length
    if (!best || wrapped < best.wrapped) best = { size, lines, wrapped }
  }
  return best && { size: best.size, lines: best.lines }
}

/** The names that make the tallest bank this many answers could print. */
function worstBankNames(count: number): string[] {
  return [...OFFICE_RELICS]
    .map((r) => r.name)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, count)
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function planGrid(options: {
  columns: number
  rows: number
  puzzleField: Box
  answerHeight: number
  wordBank: boolean
  font: string
}): OrPagePlan | null {
  const { columns, rows, puzzleField, answerHeight, wordBank, font } = options
  const count = columns * rows
  const cardWidth = Math.min(CARD_MAX_W, Math.floor((puzzleField.width - (columns - 1) * COL_GAP) / columns))
  const pictureWidth = cardWidth - CARD_PAD * 2
  if (pictureWidth < PICTURE_MIN_W) return null

  // Wide enough for the widest label any house style prints ("9." or "9)").
  const widestLabel = Math.max(
    ...OR_NUMBER_STYLES.map((style) => measureRunWidth(orNumberLabel(style, 8), NUMBER_FONT, numberSpec(font))),
  )
  const numberWidth = Math.ceil(widestLabel + NUMBER_FONT * 0.35)
  const answerWidth = cardWidth - CARD_PAD * 2 - numberWidth
  const answer = answerFontFor(answerWidth - ANSWER_INSET, font)
  if (!answer) return null
  const answerFont = answer.size
  const aliasFont = Math.max(ALIAS_FONT_MIN, Math.round(answerFont * 0.78))
  const aliasLines = Math.max(
    ...OFFICE_RELICS.map((r) => breakAliases(r.aliases, answerWidth, aliasFont, font).length),
  )
  if (OFFICE_RELICS.some((r) => r.aliases.length > 0 && breakAliases(r.aliases, answerWidth, aliasFont, font).length === 0)) {
    return null
  }
  const aliasBlock = aliasLines > 0 ? ALIAS_GAP + fabricTextHeight(aliasLines, aliasFont, ALIAS_LINE_HEIGHT) : 0

  const writeRoom = Math.max(
    WRITE_ROOM_MIN,
    Math.ceil(fabricTextHeight(answer.lines, answerFont, ANSWER_LINE_HEIGHT) + ANSWER_LIFT * 2),
  )
  const chrome = CARD_PAD * 2 + PICTURE_TO_LINE + writeRoom + RULE_HEIGHT

  let bankLines = 0
  let bankHeight = 0
  if (wordBank) {
    const width = Math.min(puzzleField.width, gridWidth({ columns, cardWidth })) - BANK_PAD * 2
    bankLines = packBank(worstBankNames(count), width, font).length
    bankHeight = bankBlockHeight(bankLines) + BANK_GAP
  }

  const rowSpan = (rows - 1) * ROW_GAP
  const puzzleCard = Math.floor((puzzleField.height - bankHeight - rowSpan) / rows)
  const answerCard = Math.floor((answerHeight - rowSpan) / rows) - aliasBlock
  const cardHeight = Math.min(puzzleCard, answerCard, chrome + PICTURE_MAX_H)
  const pictureHeight = cardHeight - chrome
  if (pictureHeight < PICTURE_MIN_H) return null

  // One pen for every picture, set by the box it draws in.
  const stroke = Math.round(clamp(Math.min(pictureWidth, pictureHeight * 1.35) * 0.0145, 2.2, 3.4) * 10) / 10
  const fineStroke = Math.round(Math.max(1.5, stroke * 0.64) * 10) / 10

  return {
    columns,
    rows,
    count,
    cardWidth,
    cardHeight,
    answerCardHeight: cardHeight + aliasBlock,
    pictureWidth,
    pictureHeight,
    numberWidth,
    writeRoom,
    answerFont,
    answerLines: answer.lines,
    aliasFont,
    stroke,
    fineStroke,
    bankHeight: wordBank ? bankHeight - BANK_GAP : 0,
    bankLines,
  }
}

/** A picture box's usable size, weighted toward width the way the drawings run. */
const pictureScore = (plan: OrPagePlan) => Math.min(plan.pictureWidth, plan.pictureHeight * 1.35)

/**
 * The fullest page whose pictures still print comfortably; failing that, the
 * fullest at the floor size. Within a count, the larger pictures win.
 */
export function planOrPage(options: {
  puzzleField: Box
  answerHeight: number
  wordBank: boolean
  font: string
}): OrPagePlan | null {
  const candidates: OrPagePlan[] = []
  for (let columns = 1; columns <= 3; columns++) {
    for (let rows = 1; rows <= 4; rows++) {
      const count = columns * rows
      if (count < MIN_ITEMS_PER_PAGE || count > MAX_ITEMS_PER_PAGE) continue
      // A single column of pictures reads as a list, and wastes a wide page.
      if (columns === 1 && options.puzzleField.width > CARD_MAX_W * 1.4) continue
      const plan = planGrid({ ...options, columns, rows })
      if (plan) candidates.push(plan)
    }
  }
  const comfortable = (plan: OrPagePlan) =>
    plan.pictureWidth >= PICTURE_COMFORT_W && plan.pictureHeight >= PICTURE_COMFORT_H
  for (const pool of [candidates.filter(comfortable), candidates]) {
    if (pool.length === 0) continue
    return pool.reduce((best, plan) =>
      plan.count > best.count || (plan.count === best.count && pictureScore(plan) > pictureScore(best)) ? plan : best,
    )
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function orContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/**
 * Air kept under the last row of cards. The page that binds the plan (the
 * answer page, whose cards grow by the alias lines) otherwise fills the column
 * to the pixel: the card frame's stroke then straddles the safe edge and the
 * bottom row reads as crossing it.
 */
export const BODY_BOTTOM_AIR = inch(0.12)

/** The part of a header's body the cards may use. */
export const orCardField = (body: Box): Box => ({ ...body, height: Math.max(1, body.height - BODY_BOTTOM_AIR) })

/** What is left of the column once the title and instruction have been set. */
export function orBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = orContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return orCardField({ ...content, top: content.top + headerHeight, height: Math.max(1, content.height - headerHeight) })
}

/** The body left under the tallest of these instructions: what every phrasing is sure to have. */
export function orTightestBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instructions: readonly string[]): Box {
  return (instructions.length > 0 ? instructions : ['']).map((text) => orBodyField(page, config, text)).reduce((tightest, field) =>
    field.height < tightest.height ? field : tightest,
  )
}

/**
 * The page these settings make, before any object is chosen. The answer page
 * carries the same title but no instruction and no word bank.
 *
 * `instructions` is every phrasing the page might print. The plan is fitted to
 * the tallest, so the form's note holds for every seller's house style.
 */
export function orWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  level: OfficeRelicsLevel
  instructions: readonly string[]
  font: string
}): OrPagePlan | null {
  const { page, config, level, instructions, font } = options
  return planOrPage({
    puzzleField: orTightestBodyField(page, config, instructions),
    answerHeight: orBodyField(page, config, '').height,
    wordBank: levelSpec(level).wordBank,
    font,
  })
}

/** What a page prints on the trim currently in Settings. */
export function orPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  level: OfficeRelicsLevel
  instructions: readonly string[]
  font: string
}): string {
  const { page } = options
  const tail = 'plus an answer page.'
  if (!page) return `Up to ${MAX_ITEMS_PER_PAGE} pictures a page, ${tail}`
  const plan = orWorstCasePlan({ ...options, page })
  if (!plan) return 'This page size is too small for Office Relics pictures — choose a larger one in Settings.'
  return (
    `${plan.count} pictures a page, each about ${pxToIn(plan.pictureWidth)} x ${pxToIn(plan.pictureHeight)} in, ` +
    tail
  )
}
