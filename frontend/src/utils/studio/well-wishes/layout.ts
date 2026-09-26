import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  boxBottom,
  columns,
  contentBox,
  fitHeaderTitle,
  insetHorizontal,
  measureHeaderHeight,
  rows,
  type Box,
} from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import type { WwFrameStyle, WwLabelPlacement } from './content'

/**
 * Everything a Well Wishes page decides on the seller's behalf.
 *
 * A page is a grid of identical framed boxes, stretched to fill the space
 * under the heading so nothing is left as an empty band at the foot. Each box
 * is a prompt, evenly spaced writing lines and a signature line on the same
 * rhythm. The numbers that govern it are handwriting numbers: a box is never
 * narrower than a hand writes comfortably, lines never closer than wide-ruled
 * paper, and never fewer than three of them above the signature. The box count
 * falls out of those: fewer, roomier boxes always win over more cramped ones.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)
const inch = (value: number) => Math.round(DPI * value)

/** Prompt and sign-off type: large print, never below 14 pt. */
export const LABEL_FONT = ptToPx(15)
export const LABEL_FONT_MIN = ptToPx(14)
/** Enough distinct prompts to run a page without leaning on repeats. */
const PROMPTS_WANTED = 10

/** Headings shrink to fit a long name, but never below this. */
export const HEADING_FONT_MIN = ptToPx(18)

/** No closer than wide-ruled paper, so an older hand has room. */
export const PITCH_MIN = inch(0.38)
/** Writing lines above the signature — room for a few sentences. */
export const LINES_MIN = 3
/** Narrowest box a sentence can be written across comfortably. */
export const BOX_MIN_WIDTH = inch(2.75)
/** Two columns only where each is still this wide. */
const TWO_COLUMN_MIN = inch(3.2)
/** A signature needs a real line, not a stub. */
export const SIGN_LINE_MIN = inch(1.6)
const MAX_ROWS = 5

const GUTTER_X = inch(0.25)
const GUTTER_Y = inch(0.16)
const PAD_X = inch(0.16)
const PAD_TOP = inch(0.1)
const PAD_BOTTOM = inch(0.14)
/** A tab label's white break in the frame reaches this far past its text. */
export const TAB_BREAK = 6
/** Space between a tab label and the first line's writing room. */
const TAB_GAP = 2
const SIGN_GAP = 8

/** The inner rule of a double frame sits this far inside the outer one. */
export const DOUBLE_INSET = 4
/** Frame stroke is centred on its edge; keep the outer half inside the field. */
const STROKE_ROOM = 1

/** The ornament rule under the heading. */
export const ORNAMENT_SIZE = 24
/** Pulled up into the header's own bottom gap, so it reads as part of the heading. */
const ORNAMENT_TUCK = 8
const ORNAMENT_BELOW = inch(0.14)

export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

/** How a set looks — the same on every page, so the pages read as one section. */
export interface WwStyle {
  frame: WwFrameStyle
  placement: WwLabelPlacement
}

export interface WwBox {
  /** The frame's outer rectangle. */
  frame: Box
  /** Where prompt text and lines start and end, inside the frame. */
  innerLeft: number
  innerWidth: number
  promptTop: number
  /** Writing lines, top down. */
  lines: number[]
  /** The signature line, on the same rhythm as the writing lines. */
  signY: number
  pitch: number
}

export interface WwPagePlan {
  field: Box
  cols: number
  rows: number
  boxes: WwBox[]
}

export interface WwPlan {
  labelFont: number
  pages: WwPagePlan[]
}

const innerInset = (style: WwStyle) => (style.frame === 'double' ? DOUBLE_INSET : 0)
export const labelHeight = (labelFont: number) => fabricTextHeight(1, labelFont)

/** Frame top and first writing room, measured from the top of the cell. */
function boxHead(style: WwStyle, labelFont: number) {
  const labelH = labelHeight(labelFont)
  if (style.placement === 'tab') {
    const frameOffset = Math.round(labelH / 2)
    return { frameOffset, promptOffset: 0, regionOffset: labelH + TAB_GAP }
  }
  const promptOffset = innerInset(style) + PAD_TOP
  return { frameOffset: 0, promptOffset, regionOffset: promptOffset + labelH }
}

/** The shortest cell that still gives LINES_MIN lines and a signature at PITCH_MIN. */
export function cellMinHeight(style: WwStyle, labelFont: number): number {
  return boxHead(style, labelFont).regionOffset + (LINES_MIN + 1) * PITCH_MIN + innerInset(style) + PAD_BOTTOM
}

export const boxPadX = (style: WwStyle) => PAD_X + innerInset(style)

/** Width a box leaves for its prompt and signature row. */
export const boxInnerWidth = (width: number, style: WwStyle) => width - 2 * STROKE_ROOM - 2 * boxPadX(style)

/** Width a tab prompt may take: its break in the frame must clear the corners. */
export const promptRoom = (innerWidth: number, style: WwStyle) =>
  style.placement === 'tab' ? innerWidth - 2 * TAB_BREAK : innerWidth

function layoutBox(cell: Box, style: WwStyle, labelFont: number): WwBox | null {
  const head = boxHead(style, labelFont)
  const frame: Box = {
    left: cell.left + STROKE_ROOM,
    top: cell.top + head.frameOffset,
    width: cell.width - 2 * STROKE_ROOM,
    height: cell.height - head.frameOffset - STROKE_ROOM,
  }
  const padX = boxPadX(style)
  const regionTop = cell.top + head.regionOffset
  const signY = Math.round(boxBottom(frame) - innerInset(style) - PAD_BOTTOM)
  const count = Math.floor((signY - regionTop) / PITCH_MIN)
  if (count < LINES_MIN + 1) return null
  const pitch = (signY - regionTop) / count
  const lines: number[] = []
  for (let k = 1; k < count; k++) lines.push(Math.round(regionTop + k * pitch))
  return {
    frame,
    innerLeft: frame.left + padX,
    innerWidth: frame.width - 2 * padX,
    promptTop: cell.top + head.promptOffset,
    lines,
    signY,
    pitch,
  }
}

/** Two columns only where both stay roomy. */
export const columnCount = (fieldWidth: number) => ((fieldWidth - GUTTER_X) / 2 >= TWO_COLUMN_MIN ? 2 : 1)

/** Width of one box's cell on a field this wide — the same on every page of a set. */
export function cellWidth(fieldWidth: number): number {
  const cols = columnCount(fieldWidth)
  return Math.floor((fieldWidth - GUTTER_X * (cols - 1)) / cols)
}

/**
 * The shortest cell any look may need. Rows are counted against this, not the
 * set's own look, so a frame or label style never changes how many people can
 * sign — only how the room they get is drawn.
 */
const ROW_MIN = Math.max(
  ...(['inside', 'tab'] as const).flatMap((placement) =>
    (['line', 'double'] as const).map((frame) => cellMinHeight({ frame, placement }, LABEL_FONT)),
  ),
)

/** Rows a field of this height holds at the minimum cell. */
export const rowCountFor = (height: number) =>
  Math.min(MAX_ROWS, Math.floor((height + GUTTER_Y) / (ROW_MIN + GUTTER_Y)))

/**
 * One page: two columns where both stay roomy, then the rows counted for the
 * page, stretched evenly to fill the field.
 */
export function planPage(field: Box, rowCount: number, style: WwStyle, labelFont: number): WwPagePlan | null {
  if (field.width < BOX_MIN_WIDTH || rowCount < 1) return null
  const cols = columnCount(field.width)
  const boxes: WwBox[] = []
  for (const row of rows(field, rowCount, GUTTER_Y)) {
    for (const cell of columns(row, cols, GUTTER_X)) {
      const box = layoutBox(
        { left: Math.round(cell.left), top: Math.round(cell.top), width: cellWidth(field.width), height: Math.floor(cell.height) },
        style,
        labelFont,
      )
      if (!box) return null
      boxes.push(box)
    }
  }
  return { field, cols, rows: rowCount, boxes }
}

/** The safe printable column every page lays out inside. */
export function wwContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** Height the ornament rule takes under a header, or 0 with no header. */
export const ornamentStrip = (headerHeight: number) =>
  headerHeight > 0 ? ORNAMENT_SIZE - ORNAMENT_TUCK + ORNAMENT_BELOW : 0

/** Top of the ornament, given the top of the body under the header. */
export const ornamentTop = (bodyTop: number) => bodyTop - ORNAMENT_TUCK

/** What heads one page: its title (blank for none) and, on the first page only, the intro. */
export interface WwPageHead {
  title: string
  instruction: string
}

/** The box field under a page's header and ornament. */
export function wwField(page: StudioConfigLayoutContext, config: StudioConfig, head: WwPageHead): Box {
  const content = wwContentBox(page)
  const header = measureHeaderHeight({ ...config, title: head.title }, head.instruction, content.width)
  const top = content.top + header + ornamentStrip(header)
  return { ...content, top, height: Math.max(1, content.top + content.height - top - STROKE_ROOM) }
}

/** True when the heading keeps a readable size on this column. */
export const headingFits = (title: string, width: number, font: string) =>
  !title || fitHeaderTitle(title, width, font).fontSize >= HEADING_FONT_MIN

/**
 * Prompt size for the set: 15 pt unless too few prompts fit the box at that
 * size, then 14 pt. The pool is whatever fits at the chosen size.
 */
export function chooseLabelFont(
  prompts: readonly string[],
  innerWidth: number,
  style: WwStyle,
  font: string,
): { labelFont: number; pool: string[] } {
  const room = promptRoom(innerWidth, style)
  const fitting = (size: number) =>
    prompts.filter((text) => hugTextBoxWidth(text, size, Infinity, italicSpec(font)) <= room)
  const large = fitting(LABEL_FONT)
  if (large.length >= PROMPTS_WANTED) return { labelFont: LABEL_FONT, pool: large }
  return { labelFont: LABEL_FONT_MIN, pool: fitting(LABEL_FONT_MIN) }
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

export const signGap = SIGN_GAP

/** Stand-in intro as long as any the set may print, so row counts never depend on which one. */
const INTRO_BASIS = ['x', 'x'].join('\n')

/**
 * Rows each page holds — fixed by the trim and header, whatever the set looks
 * like. Every page takes the first page's grid: the intro costs it room, and a
 * spread of two big boxes facing three small ones looks unplanned. Later pages
 * keep the same boxes, a little taller, rather than squeeze in another row.
 */
export function wwRowCounts(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  heads: readonly WwPageHead[],
): number[] {
  const counts = heads.map((head) =>
    rowCountFor(wwField(page, config, { ...head, instruction: head.instruction ? INTRO_BASIS : '' }).height),
  )
  const shared = Math.min(...counts)
  return counts.map(() => shared)
}

/** Every page, laid out. Null when a page cannot hold even one roomy box. */
export function planWellWishes(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  heads: readonly WwPageHead[],
  style: WwStyle,
  labelFont: number,
): WwPlan | null {
  const counts = wwRowCounts(page, config, heads)
  const pages: WwPagePlan[] = []
  for (const [index, head] of heads.entries()) {
    const plan = planPage(wwField(page, config, head), counts[index]!, style, labelFont)
    if (!plan) return null
    pages.push(plan)
  }
  return { labelFont, pages }
}

/** Boxes on each page, for the form's note. Null when the trim is too small. */
export function wwBoxCounts(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  heads: readonly WwPageHead[],
): number[] | null {
  const width = wwContentBox(page).width
  if (width < BOX_MIN_WIDTH) return null
  const counts = wwRowCounts(page, config, heads)
  if (counts.some((n) => n < 1)) return null
  return counts.map((n) => n * columnCount(width))
}
