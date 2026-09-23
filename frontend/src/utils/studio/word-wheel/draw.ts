import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  boxCenterX,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildCenteredLine,
  buildCircle,
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { ptToPx } from '../retirement-word-search/layout'
import { WORD_WHEEL_OUTER_COUNT } from './content'
import { WORD_WHEEL_LETTER_COUNT } from './levels'

/**
 * Everything a word wheel page paints, and the measurements each block is
 * painted from.
 *
 * Three blocks stack under the heading and every one of them is measured before
 * anything is drawn: the wheel, the nine slots for the long word, and — the
 * only part that differs between the two pages — either blank lines to write on
 * or the list of words the solution found. The two pages share the first two
 * blocks at identical geometry, because a reader checks a solution against the
 * page they just solved and a wheel that has moved is a wheel they have to find
 * again.
 */

/* ------------------------------------------------------------------ *
 * The wheel
 * ------------------------------------------------------------------ */

/**
 * Where the rim ends and the middle begins, as a share of the outer radius.
 *
 * A third out is where eight sectors still read as sectors rather than as a
 * pie chart, and it leaves the middle wide enough to hold a capital at the
 * size this page sets it — which is larger than the eight around it, because
 * that letter is a rule as well as a letter.
 */
export const INNER_RADIUS_RATIO = 0.34

/**
 * The second ring, drawn just inside the first.
 *
 * The centre letter is the one piece of information on this page that a solver
 * cannot afford to miss, and this book prints in black on white — so it cannot
 * be marked in the way a screen would mark it. It gets three independent
 * signals instead, any one of which survives a photocopy: it is inside a double
 * ring, the inner ring is drawn at twice the weight of everything else, and the
 * letter itself is bold and set larger than its eight neighbours.
 */
const RING_GAP_RATIO = 0.055

/** Letter heights, as a share of the wheel's diameter. */
export const OUTER_LETTER_RATIO = 0.135
export const CENTER_LETTER_RATIO = 0.17

/** Where a rim letter sits, as a share of the outer radius. */
const RIM_LETTER_RADIUS_RATIO = (1 + INNER_RADIUS_RATIO) / 2

/** Fabric paints a stroke centred on its path; keep the outer ink inside the box. */
export const WHEEL_INK_PAD = Math.ceil(STUDIO_STROKE_BOLD / 2) + 1

/** Air between the wheel and the blocks under it. */
export const WHEEL_BAND_GAP = 24

export interface WordWheelGeometry {
  diameter: number
  outerLetterFont: number
  centerLetterFont: number
}

/**
 * Paint the wheel, centred in `box`.
 *
 * One group, so a seller can move or resize the whole wheel on the canvas
 * without taking it apart, and so the page carries a single canonical name for
 * the puzzle it prints: two sheets built on the same nine letters and the same
 * middle letter are the same puzzle however their rim happens to be turned, and
 * the book run has to be able to see that.
 */
export function drawWordWheel(options: {
  box: Box
  geometry: WordWheelGeometry
  center: string
  outer: readonly string[]
  font: string
  tag: StudioTag
  /** Stable name for the puzzle, used by the book run's duplicate check. */
  canonicalKey: string
}): StudioFabricObject {
  const { box, geometry, center, outer, font, tag, canonicalKey } = options
  const { diameter, outerLetterFont, centerLetterFont } = geometry
  const radius = diameter / 2
  const cx = boxCenterX(box)
  const cy = box.top + radius + WHEEL_INK_PAD
  const innerRadius = radius * INNER_RADIUS_RATIO
  const ringRadius = innerRadius - Math.max(3, radius * RING_GAP_RATIO)
  const parts: StudioFabricObject[] = []

  parts.push(
    buildCircle(
      { left: cx, top: cy, radius, stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_HAIRLINE, strokeUniform: true },
      tag,
      'structure',
    ),
  )

  // Spokes run from the middle to the rim only. Carried across the centre they
  // would cross under the letter that matters most on the page.
  for (let i = 0; i < WORD_WHEEL_OUTER_COUNT; i++) {
    const angle = (-90 + 22.5 + i * 45) * (Math.PI / 180)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    parts.push(
      buildCenteredLine(
        {
          x1: cx + innerRadius * cos,
          y1: cy + innerRadius * sin,
          x2: cx + radius * cos,
          y2: cy + radius * sin,
          stroke: STUDIO_RULE,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          strokeUniform: true,
        },
        tag,
        'structure',
      ),
    )
  }

  parts.push(
    buildCircle(
      { left: cx, top: cy, radius: innerRadius, stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_BOLD, strokeUniform: true },
      tag,
      'structure',
    ),
    buildCircle(
      { left: cx, top: cy, radius: ringRadius, stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_HAIRLINE, strokeUniform: true },
      tag,
      'structure',
    ),
  )

  const rimRadius = radius * RIM_LETTER_RADIUS_RATIO
  outer.forEach((letter, i) => {
    const angle = (-90 + i * 45) * (Math.PI / 180)
    parts.push(
      buildText(
        {
          left: cx + rimRadius * Math.cos(angle),
          top: cy + rimRadius * Math.sin(angle),
          text: letter,
          fontFamily: font,
          fontSize: outerLetterFont,
          width: hugTextBoxWidth(letter, outerLetterFont, diameter, { fontFamily: font }),
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        tag,
        'prompt',
      ),
    )
  })

  parts.push(
    buildText(
      {
        left: cx,
        top: cy,
        text: center,
        fontFamily: font,
        fontSize: centerLetterFont,
        fontWeight: 700,
        width: hugTextBoxWidth(center, centerLetterFont, diameter, {
          fontFamily: font,
          fontWeight: 700,
        }),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        lineHeight: 1,
        fill: STUDIO_INK,
      },
      tag,
      'prompt',
    ),
  )

  const bounds: Box = {
    left: cx - radius - WHEEL_INK_PAD,
    top: cy - radius - WHEEL_INK_PAD,
    width: diameter + WHEEL_INK_PAD * 2,
    height: diameter + WHEEL_INK_PAD * 2,
  }
  return {
    ...buildGroup(parts, bounds, tag, 'structure'),
    data: { studioCanonicalKey: canonicalKey },
  }
}

/** Height the wheel block occupies, ink pad included. */
export function wheelBlockHeight(diameter: number): number {
  return diameter + WHEEL_INK_PAD * 2
}

/* ------------------------------------------------------------------ *
 * The nine slots
 * ------------------------------------------------------------------ */

/**
 * Nine ruled slots, one per letter, under a short label.
 *
 * Slots rather than one long rule: nine of them say how long the word is
 * without a sentence saying so, and they give an older hand a place to put each
 * capital. The word is always drawn onto them — hidden on the puzzle page, so
 * the editor can reveal a single sheet in place, and revealed on the solution,
 * which is what makes the solution a picture of the page the reader just
 * worked on rather than a bare list.
 */
const SLOT_MIN = 26
const SLOT_MAX = 40
const SLOT_RULE_RATIO = 0.78
const SLOT_RULE_HEIGHT = 2
const SLOT_LETTER_RATIO = 0.74
/** Lift of a written letter off its rule, so the glyph does not sit on the ink. */
const SLOT_LETTER_LIFT = 0.1
export const SLOT_LABEL_SIZE = ptToPx(12)
const SLOT_LABEL_GAP = 8
export const SLOT_LABEL = 'The nine-letter word'

export interface WordWheelSlotPlan {
  slotWidth: number
  letterFont: number
  /** Height of label + gap + letter band + rule. */
  height: number
  blockWidth: number
}

export function planWordWheelSlots(bandWidth: number): WordWheelSlotPlan | null {
  const slotWidth = Math.min(SLOT_MAX, Math.floor(bandWidth / WORD_WHEEL_LETTER_COUNT))
  if (slotWidth < SLOT_MIN) return null
  const letterFont = Math.max(1, Math.round(slotWidth * SLOT_LETTER_RATIO))
  return {
    slotWidth,
    letterFont,
    height: Math.ceil(
      fabricTextHeight(1, SLOT_LABEL_SIZE) +
        SLOT_LABEL_GAP +
        fabricTextHeight(1, letterFont) +
        SLOT_RULE_HEIGHT,
    ),
    blockWidth: slotWidth * WORD_WHEEL_LETTER_COUNT,
  }
}

/**
 * Draw the nine slots at `area`, centred.
 *
 * `revealed` decides whether the letters print as ink the reader sees. The
 * puzzle page passes false, which tags every letter as an answer and leaves it
 * hidden; the solution page passes true for the same nine glyphs in the same
 * nine places.
 */
export function drawWordWheelSlots(options: {
  area: Box
  plan: WordWheelSlotPlan
  target: string
  font: string
  tag: StudioTag
  /** Level gives the first letter away — printed on both pages. */
  firstLetterGiven: boolean
  /**
   * Solution page: the revealed word travels with the rules under it.
   * The puzzle page leaves the letters beside the rule group so each one
   * stays a hidden answer the key can reveal in place.
   */
  groupLettersWithRules?: boolean
}): StudioFabricObject[] {
  const { area, plan, target, font, tag, firstLetterGiven, groupLettersWithRules } = options
  const { slotWidth, letterFont } = plan
  const ruleWidth = Math.round(slotWidth * SLOT_RULE_RATIO)
  const lift = Math.round(slotWidth * SLOT_LETTER_LIFT)
  const ruleY = area.top + plan.height - SLOT_RULE_HEIGHT
  const left = area.left + Math.max(0, Math.round((area.width - plan.blockWidth) / 2))

  const label = buildText(
    {
      left: boxCenterX(area),
      top: area.top,
      text: toNonBreakingSpaces(SLOT_LABEL),
      fontFamily: font,
      fontSize: SLOT_LABEL_SIZE,
      fontWeight: 700,
      width: hugTextBoxWidth(SLOT_LABEL, SLOT_LABEL_SIZE, area.width, {
        fontFamily: font,
        fontWeight: 700,
      }),
      textAlign: 'center',
      originX: 'center',
      lineHeight: 1,
      fill: STUDIO_INK,
    },
    tag,
    'prompt',
  )

  const rules: StudioFabricObject[] = []
  const letters: StudioFabricObject[] = []

  for (let i = 0; i < target.length; i++) {
    const centerX = left + i * slotWidth + slotWidth / 2
    rules.push(
      buildRect(
        {
          left: Math.round(centerX - ruleWidth / 2),
          top: ruleY,
          width: ruleWidth,
          height: SLOT_RULE_HEIGHT,
          fill: STUDIO_INK,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        tag,
        'structure',
      ),
    )
    const letter = target[i]!
    const isGiven = firstLetterGiven && i === 0
    letters.push(
      buildText(
        {
          left: centerX,
          top: ruleY - lift,
          text: letter,
          fontFamily: font,
          fontSize: letterFont,
          width: hugTextBoxWidth(letter, letterFont, slotWidth, { fontFamily: font }),
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        tag,
        isGiven ? 'prompt' : 'answer',
      ),
    )
  }

  // One block: nudging a slot rule takes the other eight with it. On the
  // solution the letters go in the same block, so the word cannot be pulled
  // off the lines it is written on.
  const slotParts = groupLettersWithRules ? [...rules, ...letters] : rules
  const slotBounds = unionObjectBounds(slotParts) ?? {
    left,
    top: ruleY,
    width: plan.blockWidth,
    height: SLOT_RULE_HEIGHT,
  }
  const slotGroup = buildGroup(slotParts, slotBounds, tag, 'structure')

  return groupLettersWithRules ? [label, slotGroup] : [label, slotGroup, ...letters]
}

/* ------------------------------------------------------------------ *
 * The write-in lines (puzzle page)
 * ------------------------------------------------------------------ */

/**
 * Ruled lines for the words the solver finds.
 *
 * Sized for a hand, not for a typeface. Twenty-eight pixels is a shade under
 * three tenths of an inch — wider than the ruling on college paper, which is
 * what older handwriting needs before letters start meeting the rule above — and
 * a column has to stay wide enough for the longest word this wheel could make
 * plus the space a pencil takes getting there. Three columns is the ceiling
 * however wide the page is: a fourth would be a column of one word each.
 */
const WRITE_LINE_PITCH_MIN = 28
const WRITE_LINE_PITCH_MAX = 44
const WRITE_COLUMN_MIN_WIDTH = 100
const WRITE_MAX_COLUMNS = 3
const WRITE_COLUMN_GUTTER = 26
const WRITE_RULE_HEIGHT = 1.5
export const WRITE_CAPTION_SIZE = ptToPx(12)
const WRITE_CAPTION_GAP = 12

export interface WordWheelLinesPlan {
  columnCount: number
  rowCount: number
  columnWidth: number
  gutter: number
  rowPitch: number
  /** Already broken to the column, so Fabric has no reason to re-wrap it. */
  caption: string
  captionWidth: number
  captionHeight: number
  height: number
  blockWidth: number
  /** Lines the page prints — the most words it can be asked for. */
  capacity: number
}

/**
 * Break the caption to the column rather than shorten it.
 *
 * It carries the one rule the instruction strip can be switched off without —
 * every word uses the middle letter — so a narrow trim gets it on two lines
 * instead of losing it. Pre-broken and set in a box measured from the breaks, so
 * Fabric cannot re-wrap it into a line the band did not reserve.
 */
export function wrapWriteCaption(
  caption: string,
  bandWidth: number,
  font: string,
): { text: string; width: number; height: number } {
  if (!caption) return { text: '', width: 0, height: 0 }
  const spec: FontSpec = { fontFamily: font, fontWeight: 700 }
  const lines = wrapTextToWidth(
    caption,
    WRITE_CAPTION_SIZE,
    wrapSafeWidth(bandWidth, spec),
    spec,
  )
  const text = lines.join('\n')
  return {
    text,
    width: hugTextBoxWidth(text, WRITE_CAPTION_SIZE, bandWidth, spec),
    height: Math.ceil(fabricTextHeight(lines.length, WRITE_CAPTION_SIZE)) + WRITE_CAPTION_GAP,
  }
}

/**
 * As many write-in lines as the reserved band holds, never fewer than one row.
 *
 * The rows stretch their pitch to fill the band rather than leaving a gap under
 * the last one: white space at the foot of a worksheet reads as a page that ran
 * out of things to print, and a wider rule is a kindness to the hand using it.
 */
export function planWordWheelLines(options: {
  bandWidth: number
  maxHeight: number
  caption: string
  font: string
}): WordWheelLinesPlan | null {
  const { bandWidth, maxHeight, font } = options
  const caption = wrapWriteCaption(options.caption, bandWidth, font)
  const available = maxHeight - caption.height
  if (available < WRITE_LINE_PITCH_MIN) return null

  const columnCount = Math.max(
    1,
    Math.min(
      WRITE_MAX_COLUMNS,
      Math.floor((bandWidth + WRITE_COLUMN_GUTTER) / (WRITE_COLUMN_MIN_WIDTH + WRITE_COLUMN_GUTTER)),
    ),
  )
  const rowCount = Math.max(1, Math.floor(available / WRITE_LINE_PITCH_MIN))
  const rowPitch = Math.min(WRITE_LINE_PITCH_MAX, Math.floor(available / rowCount))
  const columnWidth = Math.floor(
    (bandWidth - WRITE_COLUMN_GUTTER * (columnCount - 1)) / columnCount,
  )

  return {
    columnCount,
    rowCount,
    columnWidth,
    gutter: WRITE_COLUMN_GUTTER,
    rowPitch,
    caption: caption.text,
    captionWidth: caption.width,
    captionHeight: caption.height,
    height: caption.height + rowCount * rowPitch,
    blockWidth: columnWidth * columnCount + WRITE_COLUMN_GUTTER * (columnCount - 1),
    capacity: rowCount * columnCount,
  }
}

/**
 * Caption and every write-in rule, as one block.
 *
 * A seller who nudges the lines should take the caption with them. Loose rules
 * would let one line slide off the column the caption still describes.
 */
export function drawWordWheelLines(options: {
  area: Box
  plan: WordWheelLinesPlan
  font: string
  tag: StudioTag
}): StudioFabricObject {
  const { area, plan, font, tag } = options
  const parts: StudioFabricObject[] = []
  let top = area.top

  if (plan.caption) {
    parts.push(
      buildText(
        {
          left: boxCenterX(area),
          top,
          text: plan.caption,
          fontFamily: font,
          fontSize: WRITE_CAPTION_SIZE,
          fontWeight: 700,
          width: plan.captionWidth,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        tag,
        'prompt',
      ),
    )
    top += plan.captionHeight
  }

  const left = area.left + Math.max(0, Math.round((area.width - plan.blockWidth) / 2))
  for (let row = 0; row < plan.rowCount; row++) {
    for (let column = 0; column < plan.columnCount; column++) {
      parts.push(
        buildRect(
          {
            left: left + column * (plan.columnWidth + plan.gutter),
            top: top + row * plan.rowPitch + plan.rowPitch - WRITE_RULE_HEIGHT,
            width: plan.columnWidth,
            height: WRITE_RULE_HEIGHT,
            fill: STUDIO_RULE,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )
    }
  }

  const bounds = unionObjectBounds(parts) ?? area
  return buildGroup(parts, bounds, tag, 'structure')
}

/* ------------------------------------------------------------------ *
 * The answer list (solution page)
 * ------------------------------------------------------------------ */

/**
 * Large-print floor and ceiling for the solution list.
 *
 * The floor is where an answer list stops being readable by the audience this
 * book is sold to. The ceiling is where a list of forty short words starts
 * competing with the wheel above it for the page.
 */
export const LIST_MIN_SIZE = ptToPx(11)
export const LIST_MAX_SIZE = ptToPx(14)
const LIST_MAX_COLUMNS = 5
const LIST_MIN_GUTTER = 16
const LIST_ROW_HEIGHT_RATIO = 1.3
const LIST_ROW_GAP = 4
export const LIST_CAPTION_SIZE = ptToPx(12)
const LIST_CAPTION_GAP = 10

/**
 * What the solution calls its list.
 *
 * "Words we found" rather than "All the words", because the second is a claim
 * no printed list can keep: a solver who finds a real word this book's lexicon
 * does not carry has not made a mistake, and a page that implies they have is a
 * page that earns a review saying so.
 */
export const LIST_CAPTION = 'Words we found — others may also be possible'

export interface WordWheelListPlan {
  fontSize: number
  columnCount: number
  rowCount: number
  cellWidth: number
  gutter: number
  rowHeight: number
  words: string[]
  captioned: boolean
  height: number
  blockWidth: number
}

function listSpec(font: string): FontSpec {
  return { fontFamily: font, fontWeight: 'normal' }
}

function widestWord(words: readonly string[], fontSize: number, font: string): number {
  const spec = listSpec(font)
  return Math.ceil(
    words.reduce((max, word) => Math.max(max, measureRunWidth(word, fontSize, spec)), 0),
  )
}

function listRowHeight(fontSize: number): number {
  return Math.ceil(fontSize * LIST_ROW_HEIGHT_RATIO)
}

function listHeight(rowCount: number, fontSize: number, captioned: boolean): number {
  const rows = Math.max(1, rowCount)
  return (
    rows * listRowHeight(fontSize) +
    Math.max(0, rows - 1) * LIST_ROW_GAP +
    (captioned ? Math.ceil(fabricTextHeight(1, LIST_CAPTION_SIZE)) + LIST_CAPTION_GAP : 0)
  )
}

function listColumns(bandWidth: number, cellWidth: number, wordCount: number): number {
  if (cellWidth > bandWidth) return 0
  const fits = Math.floor((bandWidth + LIST_MIN_GUTTER) / (cellWidth + LIST_MIN_GUTTER))
  return Math.max(1, Math.min(fits, LIST_MAX_COLUMNS, Math.max(1, wordCount)))
}

/**
 * Shortest a solution list is ever allowed to be, whatever it holds.
 *
 * `layout.ts` subtracts this from the page before it sizes the wheel, and it is
 * deliberately measured from a row count rather than from the words a
 * particular wheel produced. A floor that moved with the draw would give every
 * page in a book a slightly different wheel — the one on GARDENING larger than
 * the one on ORCHESTRA, for no reason a reader could see. Five rows at the
 * large-print floor is a list worth printing; anything past that the band earns
 * back from whatever the wheel does not use.
 */
export const BAND_FLOOR_LIST_ROWS = 5

export function minWordWheelListHeight(): number {
  return listHeight(BAND_FLOOR_LIST_ROWS, LIST_MIN_SIZE, true)
}

function planListAtSize(options: {
  words: readonly string[]
  bandWidth: number
  fontSize: number
  font: string
  captioned: boolean
}): WordWheelListPlan | null {
  const { words, bandWidth, fontSize, font, captioned } = options
  const cellWidth = Math.max(1, widestWord(words, fontSize, font))
  const columnCount = listColumns(bandWidth, cellWidth, words.length)
  if (columnCount === 0) return null
  const rowCount = Math.ceil(words.length / columnCount)
  const spread = Math.floor((bandWidth - cellWidth * columnCount) / Math.max(1, columnCount - 1))
  const gutter =
    columnCount <= 1
      ? 0
      : Math.max(LIST_MIN_GUTTER, Math.min(spread, Math.round(cellWidth * 0.5)))
  return {
    fontSize,
    columnCount,
    rowCount,
    cellWidth,
    gutter,
    rowHeight: listRowHeight(fontSize),
    words: [...words],
    captioned,
    height: listHeight(rowCount, fontSize, captioned),
    blockWidth: cellWidth * columnCount + gutter * (columnCount - 1),
  }
}

/**
 * The longest list of `words` that fits `maxHeight`, and how it sets.
 *
 * Three things can be given up and they are given up in this order: type size,
 * then the caption, then words. Every size is tried with the caption before any
 * size is tried without it, because the caption is the sentence that keeps the
 * page honest — a solver who finds a real word this book's lexicon does not
 * carry needs to be told the list is what we found, not everything there is.
 * Words go last, and from the short end: a four-letter find is the one a solver
 * is least likely to have missed and the one a printed list adds least by
 * carrying.
 *
 * Whatever survives is what the page then asks the solver to beat, so the count
 * on the puzzle page and the list on the solution page can never disagree.
 */
export function planWordWheelList(options: {
  words: readonly string[]
  bandWidth: number
  maxHeight: number
  font: string
  caption?: string
}): WordWheelListPlan | null {
  const { bandWidth, maxHeight, font } = options
  const caption = options.caption ?? ''
  let words = [...options.words]

  while (words.length > 0) {
    for (const captioned of caption ? [true, false] : [false]) {
      for (let fontSize = LIST_MAX_SIZE; fontSize >= LIST_MIN_SIZE; fontSize--) {
        const plan = planListAtSize({ words, bandWidth, fontSize, font, captioned })
        if (plan && plan.height <= maxHeight) return plan
      }
    }
    words = words.slice(1)
  }
  return null
}

export function drawWordWheelList(options: {
  area: Box
  plan: WordWheelListPlan
  caption: string
  font: string
  tag: StudioTag
}): StudioFabricObject {
  const { area, plan, caption, font, tag } = options
  const parts: StudioFabricObject[] = []
  let top = area.top

  if (plan.captioned && caption) {
    parts.push(
      buildText(
        {
          left: boxCenterX(area),
          top,
          text: caption,
          fontFamily: font,
          fontSize: LIST_CAPTION_SIZE,
          fontWeight: 700,
          width: hugTextBoxWidth(caption, LIST_CAPTION_SIZE, area.width, {
            fontFamily: font,
            fontWeight: 700,
          }),
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        tag,
        'prompt',
      ),
    )
    top += Math.ceil(fabricTextHeight(1, LIST_CAPTION_SIZE)) + LIST_CAPTION_GAP
  }

  const left = area.left + Math.max(0, Math.round((area.width - plan.blockWidth) / 2))
  const spec = listSpec(font)

  // Caption and every printed word, as one block. A row left loose would let
  // one line of the key slide off the caption that still describes the list.
  for (let row = 0; row < plan.rowCount; row++) {
    const slice = plan.words.slice(row * plan.columnCount, (row + 1) * plan.columnCount)
    slice.forEach((word, column) => {
      parts.push(
        buildText(
          {
            left: left + column * (plan.cellWidth + plan.gutter),
            top: top + row * (plan.rowHeight + LIST_ROW_GAP),
            text: word,
            fontFamily: font,
            fontSize: plan.fontSize,
            width: hugTextBoxWidth(word, plan.fontSize, plan.cellWidth, spec),
            height: plan.rowHeight,
            textAlign: 'left',
            originX: 'left',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          'prompt',
        ),
      )
    })
  }

  const bounds = unionObjectBounds(parts) ?? area
  return buildGroup(parts, bounds, tag, 'structure')
}
