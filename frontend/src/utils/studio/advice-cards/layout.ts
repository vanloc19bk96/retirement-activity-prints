import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { boxBottom, boxRight, columns, rows, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, wrapSafeWidth, wrapTextToWidth, type FontSpec } from '../studio-text-metrics'
import type { WwFrameStyle } from '../well-wishes/content'
import { DOUBLE_INSET, italicSpec, plainSpec, ptToPx, wwField, type WwPageHead } from '../well-wishes/layout'

/**
 * Everything an advice card page decides on the seller's behalf.
 *
 * A page is a grid of identical framed cards — one, two or four, as the
 * seller asked — stretched to fill the space under the heading. Each card is
 * a sentence to finish, evenly spaced writing lines and a signature line on
 * the same rhythm. Cut-apart cards also carry the set's heading, since the
 * page heading is trimmed away, and dashed cut lines run down the gutters.
 *
 * The numbers are handwriting numbers, as on the Well Wishes pages: a card is
 * never narrower than a hand writes comfortably, lines never closer than
 * wide-ruled paper, and never fewer than three above the signature. A grid
 * that cannot meet them is refused, with a plain message, never squeezed.
 */

const inch = (value: number) => Math.round(DPI * value)

/** Prompt type: large print, never below 14 pt. */
export const LABEL_FONT = ptToPx(15)
export const LABEL_FONT_MIN = ptToPx(14)
/** A prompt wraps onto two lines at most; every card reserves both. */
export const PROMPT_MAX_LINES = 2
/** Enough distinct prompts to run a set without leaning on repeats. */
const PROMPTS_WANTED = 12

/** The small heading a cut-apart card carries, shrinking to fit before it gives up. */
export const CARD_TITLE_FONT = ptToPx(12)
export const CARD_TITLE_FONT_MIN = ptToPx(11)
const CARD_TITLE_GAP = inch(0.06)
/** The number in front of each line on a list card. */
export const NUMBER_FONT = ptToPx(12)
export const NUMBER_GAP = 6

/** No closer than wide-ruled paper, so an older hand has room. */
export const PITCH_MIN = inch(0.38)
/** Writing lines above the signature — room for a sentence or two. */
export const LINES_MIN = 3
/** Narrowest card a sentence can be written across comfortably. */
export const CARD_MIN_WIDTH = inch(2.4)
/** A signature needs a real line, not a stub. */
export const SIGN_LINE_MIN = inch(1.2)
export const SIGN_GAP = 8

const GUTTER = inch(0.22)
/** Cut-apart cards leave room for scissors either side of the dashed line. */
const CUT_GUTTER = inch(0.36)
const PAD_X = inch(0.16)
const PAD_TOP = inch(0.12)
const PAD_BOTTOM = inch(0.16)
/** Frame stroke is centred on its edge; keep the outer half inside the field. */
const STROKE_ROOM = 1

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 'bold' })

/** What a card prints above its lines. */
export interface AcCardHead {
  /** Cut-apart cards carry a small heading; '' for none. */
  title: string
  titleFont: number
}

export interface AcCard {
  /** The frame's outer rectangle. */
  frame: Box
  innerLeft: number
  innerWidth: number
  /** Top of the card heading, when there is one. */
  titleTop: number
  promptTop: number
  /** Writing lines for a two-line prompt, top down; a one-line prompt gains one above. */
  lines: number[]
  signY: number
  pitch: number
}

export interface AcPagePlan {
  field: Box
  cols: number
  rows: number
  cards: AcCard[]
  /** Dashed cut lines, in the middle of the gutters (cut-apart sets only). */
  cuts: { x1: number; y1: number; x2: number; y2: number }[]
}

export interface AcPlan {
  labelFont: number
  pages: AcPagePlan[]
}

const frameInset = (frame: WwFrameStyle) => (frame === 'double' ? DOUBLE_INSET : 0)
const promptHeight = (labelFont: number, lines = PROMPT_MAX_LINES) => fabricTextHeight(lines, labelFont)
const titleHeight = (head: AcCardHead) => (head.title ? fabricTextHeight(1, head.titleFont) + CARD_TITLE_GAP : 0)

/** The shortest card that still gives LINES_MIN lines and a signature at PITCH_MIN, for any look. */
function cardMinHeight(cutApart: boolean): number {
  const title = cutApart ? fabricTextHeight(1, CARD_TITLE_FONT) + CARD_TITLE_GAP : 0
  return (
    2 * (STROKE_ROOM + DOUBLE_INSET) +
    PAD_TOP +
    title +
    promptHeight(LABEL_FONT) +
    (LINES_MIN + 1) * PITCH_MIN +
    PAD_BOTTOM
  )
}

/** Width a card leaves for its prompt, heading and signature row. */
export const cardInnerWidth = (cardWidth: number, frame: WwFrameStyle) =>
  cardWidth - 2 * STROKE_ROOM - 2 * (PAD_X + frameInset(frame))

const gutterFor = (cutApart: boolean) => (cutApart ? CUT_GUTTER : GUTTER)

/**
 * Columns and rows for a page of `cards`: one card fills the field, two stack,
 * four make a 2 x 2 grid where both columns stay roomy and one column of four
 * otherwise. Null when no arrangement meets the handwriting minimums.
 */
export function gridFor(field: Box, cards: number, cutApart: boolean): { cols: number; rows: number } | null {
  const gutter = gutterFor(cutApart)
  const minHeight = cardMinHeight(cutApart)
  const fits = (cols: number, rowCount: number) =>
    (field.width - gutter * (cols - 1)) / cols >= CARD_MIN_WIDTH &&
    (field.height - gutter * (rowCount - 1)) / rowCount >= minHeight
  const options =
    cards === 1 ? [[1, 1]] : cards === 2 ? [[1, 2], [2, 1]] : [[2, 2], [1, 4]]
  for (const [cols, rowCount] of options) {
    if (fits(cols!, rowCount!)) return { cols: cols!, rows: rowCount! }
  }
  return null
}

/** Width of one card on a field this wide. */
export function cardWidthFor(fieldWidth: number, cols: number, cutApart: boolean): number {
  return Math.floor((fieldWidth - gutterFor(cutApart) * (cols - 1)) / cols)
}

function layoutCard(cell: Box, frameStyle: WwFrameStyle, labelFont: number, head: AcCardHead): AcCard | null {
  const frame: Box = {
    left: cell.left + STROKE_ROOM,
    top: cell.top + STROKE_ROOM,
    width: cell.width - 2 * STROKE_ROOM,
    height: cell.height - 2 * STROKE_ROOM,
  }
  const inset = frameInset(frameStyle)
  const padX = PAD_X + inset
  const titleTop = frame.top + inset + PAD_TOP
  const promptTop = titleTop + titleHeight(head)
  const regionTop = promptTop + promptHeight(labelFont)
  const signY = Math.round(boxBottom(frame) - inset - PAD_BOTTOM)
  const count = Math.floor((signY - regionTop) / PITCH_MIN)
  if (count < LINES_MIN + 1) return null
  const pitch = (signY - regionTop) / count
  const lines: number[] = []
  for (let k = 1; k < count; k++) lines.push(Math.round(regionTop + k * pitch))
  return {
    frame,
    innerLeft: frame.left + padX,
    innerWidth: frame.width - 2 * padX,
    titleTop,
    promptTop,
    lines,
    signY,
    pitch,
  }
}

/**
 * A card's writing lines for a prompt of `promptLines` lines. The lines keep
 * one rhythm up from the signature, so a one-line prompt gains a line above
 * rather than a gap, and cards side by side line up.
 */
export function cardLines(card: AcCard, promptLines: number, labelFont: number): number[] {
  const promptBottom = card.promptTop + promptHeight(labelFont, promptLines)
  const lines = [...card.lines]
  const above = Math.round((lines[0] ?? card.signY) - card.pitch)
  if (above - promptBottom >= PITCH_MIN * 0.75) lines.unshift(above)
  return lines
}

/** Dashed lines down the middle of every gutter, across the whole field. */
function cutLines(field: Box, cols: number, rowCount: number, cutApart: boolean): AcPagePlan['cuts'] {
  if (!cutApart) return []
  const gutter = gutterFor(cutApart)
  const cuts: AcPagePlan['cuts'] = []
  const cellW = (field.width - gutter * (cols - 1)) / cols
  const cellH = (field.height - gutter * (rowCount - 1)) / rowCount
  for (let c = 1; c < cols; c++) {
    const x = Math.round(field.left + c * cellW + (c - 0.5) * gutter)
    cuts.push({ x1: x, y1: field.top, x2: x, y2: Math.round(boxBottom(field)) })
  }
  for (let r = 1; r < rowCount; r++) {
    const y = Math.round(field.top + r * cellH + (r - 0.5) * gutter)
    cuts.push({ x1: field.left, y1: y, x2: Math.round(boxRight(field)), y2: y })
  }
  return cuts
}

/** One page of cards, stretched evenly to fill the field. */
export function planPage(
  field: Box,
  grid: { cols: number; rows: number },
  options: { cutApart: boolean; frame: WwFrameStyle; labelFont: number; head: AcCardHead },
): AcPagePlan | null {
  const { cutApart, frame, labelFont, head } = options
  const gutter = gutterFor(cutApart)
  const width = cardWidthFor(field.width, grid.cols, cutApart)
  const cards: AcCard[] = []
  for (const row of rows(field, grid.rows, gutter)) {
    for (const cell of columns(row, grid.cols, gutter)) {
      const card = layoutCard(
        { left: Math.round(cell.left), top: Math.round(cell.top), width, height: Math.floor(cell.height) },
        frame,
        labelFont,
        head,
      )
      if (!card) return null
      cards.push(card)
    }
  }
  return { field, cols: grid.cols, rows: grid.rows, cards, cuts: cutLines(field, grid.cols, grid.rows, cutApart) }
}

/** Stand-in intro as long as any the set may print, so the grid never depends on which one. */
const INTRO_BASIS = ['x', 'x'].join('\n')

/**
 * The grid every page of a set shares — read off the first page, whose intro
 * costs it room. Null when the chosen cards per page do not fit the trim.
 */
export function acGrid(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  head: WwPageHead,
  cards: number,
  cutApart: boolean,
): { field: Box; grid: { cols: number; rows: number } } | null {
  const field = wwField(page, config, { ...head, instruction: head.instruction ? INTRO_BASIS : '' })
  const grid = gridFor(field, cards, cutApart)
  return grid ? { field, grid } : null
}

/**
 * Prompt size for the set: 15 pt unless too few prompts fit two lines at that
 * size, then 14 pt. The pool is whatever fits at the chosen size.
 */
export function chooseLabelFont(
  prompts: readonly string[],
  innerWidth: number,
  font: string,
): { labelFont: number; pool: string[] } {
  const fitting = (size: number) =>
    prompts.filter((text) => wrapPrompt(text, size, innerWidth, font).length <= PROMPT_MAX_LINES)
  const large = fitting(LABEL_FONT)
  if (large.length >= PROMPTS_WANTED) return { labelFont: LABEL_FONT, pool: large }
  return { labelFont: LABEL_FONT_MIN, pool: fitting(LABEL_FONT_MIN) }
}

/** A prompt's printed lines, wrapped by real glyph widths so Fabric never re-wraps them. */
export const wrapPrompt = (text: string, size: number, innerWidth: number, font: string) =>
  wrapTextToWidth(text, size, wrapSafeWidth(innerWidth, italicSpec(font)), italicSpec(font))

/** The card heading's size, or 0 when it will not fit even at its smallest. */
export function cardTitleFont(title: string, innerWidth: number, font: string): number {
  for (const size of [CARD_TITLE_FONT, CARD_TITLE_FONT_MIN]) {
    if (hugTextBoxWidth(title, size, Infinity, boldSpec(font)) <= innerWidth) return size
  }
  return 0
}

/** Sign-offs that still leave a real signature line. */
export function fittingSignoffs(
  signoffs: readonly string[],
  innerWidth: number,
  labelFont: number,
  font: string,
): string[] {
  return signoffs.filter(
    (text) => innerWidth - hugTextBoxWidth(text, labelFont, Infinity, plainSpec(font)) - SIGN_GAP >= SIGN_LINE_MIN,
  )
}

/** Stand-ins: only whether a page has a title or intro changes the grid, never the words. */
const SAMPLE = 'x'

/** Card size on the trim in Settings, for the form; or why the cards do not fit. */
export function acFit(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  cards: number,
  cutApart: boolean,
): { ok: true; cardWidth: number; cardHeight: number } | { ok: false } {
  const head: WwPageHead = {
    title: String(config.title ?? '').trim() ? SAMPLE : '',
    instruction: config.showInstructions === false ? '' : SAMPLE,
  }
  const planned = acGrid(page, config, head, cards, cutApart)
  if (!planned) return { ok: false }
  const { field, grid } = planned
  const gutter = gutterFor(cutApart)
  return {
    ok: true,
    cardWidth: cardWidthFor(field.width, grid.cols, cutApart),
    cardHeight: Math.floor((field.height - gutter * (grid.rows - 1)) / grid.rows),
  }
}
