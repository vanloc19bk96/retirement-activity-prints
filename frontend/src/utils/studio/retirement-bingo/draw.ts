import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { toNonBreakingSpaces } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  canonicalHash,
  canonicalKeyData,
  canonicalSetForm,
  composeCanonicalForm,
} from '../_shared/uniqueness'
import {
  BINGO_CENTER_INDEX,
  BINGO_SIZE,
  RETIREMENT_BINGO_FREE_TEXT,
  momentKey,
  type RetirementBingoMoment,
} from './content'
import {
  PHRASE_FONT_MIN,
  PHRASE_LINE_HEIGHT,
  wrapBingoPhrase,
  type RetirementBingoPagePlan,
} from './layout'
import { BINGO_RULES, type RetirementBingoHouseStyle } from './style'

/**
 * One bingo card, drawn in print order: the column letters, the free square,
 * the grid, the squares, and the write-in line under it — each in the seller's
 * house style (`style.ts`).
 *
 * Everything is flat on the page rather than grouped, so a seller who wants to
 * reword one square double-clicks it and types — no ungrouping, no hunting
 * for the text inside a locked block.
 */

const TEMPLATE_KEY = 'retirement-bingo'

/**
 * Tint behind the free square. About ten percent grey: visible on a KDP
 * black-and-white interior, light enough that a pencil mark still shows on it.
 * Every free-square style also frames the square in ink and sets it in bold
 * capitals, so nothing about it depends on the tint surviving the press.
 */
export const BINGO_FREE_SHADE = '#E5E7EB'

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const

/** Fabric `data` key naming what a piece of the card is, for tests and tooling. */
export const BINGO_PART_KEY = 'bingoPart'

/** Share of a phrase-square the NAP word may span. */
const NAP_WIDTH_SHARE = 0.78
const NAP_FONT_RATIO = 0.3
const FREE_FONT_RATIO = 0.11
/** The FREE label is tracked out so it reads as a label, not as a phrase. */
const FREE_CHAR_SPACING = 160
/** Tracking a long label ("FREE SQUARE") falls back to before it shrinks. */
const FREE_CHAR_SPACING_TIGHT = 40
/** Share of the free frame the label may span. */
const FREE_WIDTH_SHARE = 0.86

function part<T extends StudioFabricObject>(obj: T, name: string): T {
  return { ...obj, data: { ...(obj.data ?? {}), [BINGO_PART_KEY]: name } }
}

function cellBox(plan: RetirementBingoPagePlan, index: number) {
  const { cell } = plan.metrics
  const row = Math.floor(index / BINGO_SIZE)
  const col = index % BINGO_SIZE
  return {
    left: plan.gridLeft + col * cell,
    top: plan.gridTop + row * cell,
    x: plan.gridLeft + col * cell + cell / 2,
    y: plan.gridTop + row * cell + cell / 2,
  }
}

/**
 * The card's identity for uniqueness: the *set* of its 24 moments.
 *
 * The same 24 squares shuffled into new places are, to a reader, the same card
 * — they would cross off the same things. Position-based fingerprinting would
 * call that a new page; this key, stamped on every square, makes the Studio's
 * book-wide ledger treat it as the repeat it is (§4.2, §4.3).
 */
export function retirementBingoCardKey(moments: readonly RetirementBingoMoment[]): string {
  const form = composeCanonicalForm(
    TEMPLATE_KEY,
    canonicalSetForm(moments, (moment) => momentKey(moment.text)),
  )
  return canonicalHash(form)
}

function drawColumnLetters(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  style: RetirementBingoHouseStyle,
  font: string,
  tag: StudioTag,
): void {
  const { cell, letterFont, letterRow } = plan.metrics
  const rules = BINGO_RULES[style.rules]
  const band = { left: plan.gridLeft, top: plan.letterTop, width: plan.gridSize, height: letterRow }
  const spec: FontSpec = { fontFamily: font, fontWeight: 700 }

  if (style.header === 'boxed') {
    // Reach down by one outer rule so the band's bottom bar lands exactly on
    // the grid's top bar. Stopping at the grid edge draws two touching bars,
    // which prints as a doubled line under the letters.
    const boxedBand = { ...band, height: letterRow + rules.outer }
    objects.push(
      ...drawGridLines(boxedBand, cell, BINGO_SIZE, 1, tag, {
        thickness: rules.inner,
        fill: STUDIO_RULE,
        rowPitch: boxedBand.height,
        boxCols: BINGO_SIZE,
        boxRows: 1,
        boldThickness: rules.outer,
      }).map((bar) => part(bar, 'header')),
    )
  } else if (style.header === 'solid') {
    objects.push(
      part(
        buildRect(
          { ...band, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 },
          tag,
          'decoration',
        ),
        'header',
      ),
    )
    // Paper-coloured gaps keep five letters reading as five columns.
    for (let col = 1; col < BINGO_SIZE; col++) {
      objects.push(
        part(
          buildRect(
            {
              left: plan.gridLeft + col * cell - rules.inner / 2,
              top: plan.letterTop,
              width: rules.inner,
              height: letterRow,
              fill: STUDIO_PAPER,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'decoration',
          ),
          'header',
        ),
      )
    }
  }

  const framed = style.header !== 'plain'
  BINGO_LETTERS.forEach((letter, col) => {
    objects.push(
      part(
        buildText(
          {
            left: plan.gridLeft + col * cell + cell / 2,
            top: framed ? plan.letterTop + letterRow / 2 : plan.letterTop,
            text: letter,
            width: hugTextBoxWidth(letter, letterFont, cell, spec),
            fontFamily: font,
            fontSize: letterFont,
            fontWeight: 700,
            fill: style.header === 'solid' ? STUDIO_PAPER : STUDIO_INK,
            textAlign: 'center',
            originX: 'center',
            originY: framed ? 'center' : 'top',
            lineHeight: 1,
          },
          tag,
          'decoration',
        ),
        'letter',
      ),
    )
  })
}

/** The label every free square can fall back to — short enough for any trim. */
const FREE_LABEL_FALLBACK = 'FREE'

/**
 * Largest label size, and tracking, that keep the label on one line in the
 * frame. Tries the house label first and falls back to plain FREE: on a 5 x 8
 * trim "FREE SQUARE" does not fit a free square at any readable size, and a
 * label printed across the frame is worse than a shorter one.
 */
function fitFreeLabel(
  preferredLabel: string,
  preferred: number,
  maxWidth: number,
  spec: FontSpec,
): { label: string; fontSize: number; charSpacing: number } {
  const floor = Math.max(8, Math.round(PHRASE_FONT_MIN * 0.75))
  for (const label of [preferredLabel, FREE_LABEL_FALLBACK]) {
    const text = toNonBreakingSpaces(label)
    const width = (size: number, spacing: number) =>
      measureRunWidth(text, size, spec) + (size * spacing * text.length) / 1000
    for (const charSpacing of [FREE_CHAR_SPACING, FREE_CHAR_SPACING_TIGHT]) {
      for (let size = preferred; size >= floor; size--) {
        if (width(size, charSpacing) <= maxWidth) return { label: text, fontSize: size, charSpacing }
      }
    }
  }
  return { label: FREE_LABEL_FALLBACK, fontSize: floor, charSpacing: 0 }
}

/**
 * The free square: framed inside its rules, set FREE over NAP in bold.
 *
 * Three independent cues whatever the style — an ink frame, bold capitals, and
 * either a tint or a second frame — so the square still reads as "already
 * yours" on a press that drops the tint to white.
 */
function drawFreeSquare(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  style: RetirementBingoHouseStyle,
  font: string,
  tag: StudioTag,
): void {
  const { cell, pad } = plan.metrics
  const { left, top, x, y } = cellBox(plan, BINGO_CENTER_INDEX)
  const inset = Math.max(4, Math.round(pad * 0.7))
  const frame = cell - inset * 2
  const tinted = style.freeMark !== 'double-frame'
  const radius = style.freeMark === 'tint-rounded' ? Math.round(cell * 0.08) : 0

  objects.push(
    part(
      buildRect(
        {
          left: left + inset,
          top: top + inset,
          width: frame,
          height: frame,
          fill: tinted ? BINGO_FREE_SHADE : 'transparent',
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          ...(radius > 0 ? { rx: radius, ry: radius } : {}),
        },
        tag,
        'structure',
      ),
      'free-mark',
    ),
  )
  if (style.freeMark === 'double-frame') {
    const gap = Math.max(3, Math.round(cell * 0.035))
    objects.push(
      part(
        buildRect(
          {
            left: left + inset + gap,
            top: top + inset + gap,
            width: frame - gap * 2,
            height: frame - gap * 2,
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: STUDIO_STROKE_HAIRLINE,
          },
          tag,
          'structure',
        ),
        'free-mark',
      ),
    )
  }

  const boldSpec: FontSpec = { fontFamily: font, fontWeight: 700 }
  let napFont = Math.round(cell * NAP_FONT_RATIO)
  while (
    napFont > PHRASE_FONT_MIN &&
    measureRunWidth(RETIREMENT_BINGO_FREE_TEXT, napFont, boldSpec) > frame * NAP_WIDTH_SHARE
  ) {
    napFont -= 1
  }
  const labelFit = fitFreeLabel(
    style.freeLabel,
    Math.max(
      Math.round(PHRASE_FONT_MIN * 0.8),
      Math.min(plan.phraseFont, Math.round(cell * FREE_FONT_RATIO)),
    ),
    frame * FREE_WIDTH_SHARE,
    boldSpec,
  )
  const gap = Math.max(2, Math.round(cell * 0.03))
  const labelHeight = fabricTextHeight(1, labelFit.fontSize, 1)
  const napHeight = fabricTextHeight(1, napFont, 1)
  const stackTop = y - (labelHeight + gap + napHeight) / 2
  const textWidth = frame - 4

  objects.push(
    part(
      buildText(
        {
          left: x,
          top: stackTop,
          text: labelFit.label,
          width: textWidth,
          fontFamily: font,
          fontSize: labelFit.fontSize,
          fontWeight: 700,
          charSpacing: labelFit.charSpacing,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
        },
        tag,
        'structure',
      ),
      'free-label',
    ),
    part(
      buildText(
        {
          left: x,
          top: stackTop + labelHeight + gap,
          text: RETIREMENT_BINGO_FREE_TEXT,
          width: textWidth,
          fontFamily: font,
          fontSize: napFont,
          fontWeight: 700,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
        },
        tag,
        'structure',
      ),
      'free-text',
    ),
  )
}

function drawMoments(
  objects: StudioFabricObject[],
  moments: readonly RetirementBingoMoment[],
  lines: ReadonlyMap<string, string[]>,
  plan: RetirementBingoPagePlan,
  font: string,
  tag: StudioTag,
): void {
  const { metrics, phraseFont } = plan
  const cardKey = canonicalKeyData(TEMPLATE_KEY, retirementBingoCardKey(moments))
  let next = 0
  for (let index = 0; index < BINGO_SIZE * BINGO_SIZE; index++) {
    if (index === BINGO_CENTER_INDEX) continue
    const moment = moments[next++]
    if (!moment) continue
    // Pre-broken and set in a box wider than any line, so Fabric keeps the
    // planned breaks instead of re-wrapping onto a line the square has no room for.
    const broken =
      lines.get(moment.text) ??
      wrapBingoPhrase(moment.text, phraseFont, metrics.fitWidth, { fontFamily: font }) ??
      [moment.text]
    const { x, y } = cellBox(plan, index)
    const text = buildText(
      {
        left: x,
        top: y,
        text: broken.join('\n'),
        width: metrics.textBoxWidth,
        fontFamily: font,
        fontSize: phraseFont,
        lineHeight: PHRASE_LINE_HEIGHT,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    )
    objects.push({ ...text, data: { ...cardKey, [BINGO_PART_KEY]: 'moment' } })
  }
}

function drawFooter(
  objects: StudioFabricObject[],
  plan: RetirementBingoPagePlan,
  style: RetirementBingoHouseStyle,
  font: string,
  tag: StudioTag,
): void {
  const { cell, footerFont } = plan.metrics
  const spec: FontSpec = { fontFamily: font }
  // Non-breaking: a label that wraps puts its last word under the line it
  // introduces.
  const label = toNonBreakingSpaces(style.writeIn)
  const labelWidth = hugTextBoxWidth(label, footerFont, plan.gridSize, spec)
  const gap = Math.round(footerFont * 0.5)
  const ruleWidth = Math.max(
    0,
    Math.min(Math.round(cell * 1.8), plan.gridSize - labelWidth - gap),
  )
  const total = labelWidth + gap + ruleWidth
  const left = Math.round(plan.gridLeft + (plan.gridSize - total) / 2)

  objects.push(
    part(
      buildText(
        {
          left,
          top: plan.footerTop,
          text: label,
          width: labelWidth,
          fontFamily: font,
          fontSize: footerFont,
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
      'write-in',
    ),
  )
  if (ruleWidth <= 0) return
  objects.push(
    part(
      buildRect(
        {
          left: left + labelWidth + gap,
          // On the baseline, where a hand writes, not under the descenders.
          top: plan.footerTop + Math.round(footerFont * 0.95),
          width: ruleWidth,
          height: STUDIO_STROKE_HAIRLINE,
          fill: STUDIO_INK,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        tag,
        'decoration',
      ),
      'write-in',
    ),
  )
}

export function drawRetirementBingoCard(
  objects: StudioFabricObject[],
  options: {
    moments: readonly RetirementBingoMoment[]
    /** Pre-broken lines for every moment on the card, keyed by its text. */
    lines: ReadonlyMap<string, string[]>
    plan: RetirementBingoPagePlan
    style: RetirementBingoHouseStyle
    font: string
    tag: StudioTag
  },
): void {
  const { moments, lines, plan, style, font, tag } = options
  const rules = BINGO_RULES[style.rules]
  drawColumnLetters(objects, plan, style, font, tag)
  // The free square goes down before the rules, so nothing overprints them.
  drawFreeSquare(objects, plan, style, font, tag)
  objects.push(
    ...drawGridLines(
      { left: plan.gridLeft, top: plan.gridTop, width: plan.gridSize, height: plan.gridSize },
      plan.metrics.cell,
      BINGO_SIZE,
      BINGO_SIZE,
      tag,
      {
        thickness: rules.inner,
        fill: STUDIO_RULE,
        boxCols: BINGO_SIZE,
        boxRows: BINGO_SIZE,
        boldThickness: rules.outer,
      },
    ),
  )
  drawMoments(objects, moments, lines, plan, font, tag)
  drawFooter(objects, plan, style, font, tag)
}
