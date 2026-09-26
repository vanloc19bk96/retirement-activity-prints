import type { StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { boxBottom, boxCenterX, contentBox, insetBox, insetHorizontal, toNonBreakingSpaces, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  isExactMeasurement,
  measureBlockWidth,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import type { CrNameStyle } from './content'

/**
 * Everything a certificate page decides on the seller's behalf.
 *
 * The page is one framed certificate filling the safe area: a frame band,
 * then a centred stack — emblem, heading, lead, name, citation, promotion
 * line, new title — over a signature row. Every text block is measured with
 * the same glyph widths Fabric renders, fitted by shrinking to a floor and
 * then wrapping to at most two (or four, for the citation) balanced lines.
 * One scale is chosen for the whole stack so it fills the page the way a
 * certificate should — generous on a large trim, never cramped on a small
 * one — and what is left over becomes breathing room between the blocks,
 * weighted so the name and the title stand apart.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const inch = (value: number) => Math.round(DPI * value)

/* ------------------------------------------------------------ frame */

/** Frame stroke is centred on its edge; keep the outer half inside the safe area. */
const STROKE_ROOM = 2
/** How far frame ornaments may reach inward from the outer edge. */
export const FRAME_DEPTH = 30
/** Text keeps this far inside the outer frame — clear of every ornament. */
const PAD_X = inch(0.36)
const PAD_Y = inch(0.36)

/** Smallest text area a certificate is laid out in. Below it, the page says so. */
const AREA_MIN_WIDTH = inch(2.6)
const AREA_MIN_HEIGHT = inch(4.6)

/* ------------------------------------------------------------- type */

/** Base sizes at scale 1, and the floors nothing is fitted below. */
export const SIZES = {
  over: { base: ptToPx(12), min: ptToPx(10) },
  heading: { base: ptToPx(30), min: ptToPx(20) },
  lead: { base: ptToPx(15), min: ptToPx(12.5) },
  name: { base: ptToPx(40), min: ptToPx(22) },
  citation: { base: ptToPx(14), min: ptToPx(12) },
  promotion: { base: ptToPx(11.5), min: ptToPx(10) },
  title: { base: ptToPx(24), min: ptToPx(17) },
  signLabel: { base: ptToPx(10.5), min: ptToPx(10) },
  date: { base: ptToPx(14), min: ptToPx(11) },
} as const

/** Letter spacing (1/1000 em) for the small capitals lines. */
export const CAPS_SPACING = 180
const CITATION_LINE_HEIGHT = 1.3
const TEXT_LINE_HEIGHT = 1.12

const SCALES = [1.35, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8]
/** Above scale 1, the stack takes at most this share of the height; the rest is air. */
const FILL_TARGET = 0.8

export const EMBLEM_BASE = 30

/* ---------------------------------------------------------- signature */

/** A signature needs a real line. */
export const SIGN_MIN = inch(1.3)
const SIGN_MAX = inch(2.4)
const SIGN_GAP = inch(0.3)
/** Room above a signature line for a hand to write in. */
export const SIGN_ROOM = inch(0.42)
const SIGN_LABEL_GAP = 5
const SEAL_BASE = inch(0.95)
const SEAL_GAP = inch(0.16)
const STACKED_WIDTH = inch(2.6)

/** A blank name line: wide enough for a full name, tall enough for a large hand. */
export const NAME_LINE_MIN_WIDTH = inch(2.2)
const NAME_LINE_MAX_WIDTH = inch(4.2)
export const NAME_ROOM_MIN = inch(0.5)

export const DIVIDER_HEIGHT = 10

/* ----------------------------------------------------------- measure */

export interface CrTextSpec extends FontSpec {
  charSpacing?: number
}

/** Fitted, measured text: explicit lines, locked with NBSP so Fabric never re-wraps them. */
export interface CrText {
  text: string
  lines: number
  fontSize: number
  width: number
  height: number
  lineHeight: number
  spec: CrTextSpec
}

const pad = (measured: number, spec: FontSpec) => (isExactMeasurement(spec) ? 1 : Math.max(2, measured * 0.06))

/** Hugging width of one line, letter spacing included. */
export function lineWidth(text: string, fontSize: number, spec: CrTextSpec): number {
  const spacing = ((spec.charSpacing ?? 0) / 1000) * fontSize * [...text].length
  const measured = measureRunWidth(text, fontSize, spec) + spacing
  return Math.ceil(measured + pad(measured, spec))
}

function blockWidth(lines: readonly string[], fontSize: number, spec: CrTextSpec): number {
  if (!spec.charSpacing) {
    const measured = measureBlockWidth(lines.join('\n'), fontSize, spec)
    return Math.ceil(measured + pad(measured, spec))
  }
  return Math.max(...lines.map((line) => lineWidth(line, fontSize, spec)))
}

function toText(lines: string[], fontSize: number, spec: CrTextSpec, lineHeight: number): CrText {
  return {
    text: lines.map(toNonBreakingSpaces).join('\n'),
    lines: lines.length,
    fontSize,
    width: blockWidth(lines, fontSize, spec),
    height: Math.ceil(fabricTextHeight(lines.length, fontSize, lineHeight)),
    lineHeight,
    spec,
  }
}

/**
 * Wrapped by real glyph widths, then balanced — the narrowest measure that
 * keeps the same number of lines — so a two-line name or title never ends on
 * a lone word.
 */
function wrapBalanced(text: string, fontSize: number, width: number, spec: CrTextSpec): string[] {
  const wrap = (measure: number) => wrapTextToWidth(text, fontSize, measure, spec)
  const full = wrapSafeWidth(width, spec)
  const lines = wrap(full)
  if (lines.length < 2) return lines
  let lo = full / 2
  let hi = full
  while (hi - lo > 3) {
    const measure = (lo + hi) / 2
    if (wrap(measure).length === lines.length) hi = measure
    else lo = measure
  }
  return wrap(hi)
}

/**
 * The best place to break a short line in two: the split whose longer half is
 * narrowest. Breaks at a space first; a hyphen ("O’Connell-Hughes") only when
 * no space break fits. Each half is checked with the same hugging measure as
 * a single line, and both are NBSP-locked, so Fabric draws exactly these two.
 */
function splitInTwo(text: string, fontSize: number, width: number, spec: CrTextSpec): string[] | null {
  let best: string[] | null = null
  let bestWidth = Number.POSITIVE_INFINITY
  for (const byHyphen of [false, true]) {
    for (let i = 1; i < text.length - 1; i++) {
      const ch = text[i]
      if (byHyphen ? ch !== '-' : ch !== ' ') continue
      const lines = byHyphen ? [text.slice(0, i + 1), text.slice(i + 1)] : [text.slice(0, i), text.slice(i + 1)]
      if (lines.some((line) => !line.trim())) continue
      const widest = Math.max(...lines.map((line) => lineWidth(line, fontSize, spec)))
      if (widest <= width && widest < bestWidth) {
        best = lines
        bestWidth = widest
      }
    }
    if (best) return best
  }
  return null
}

/**
 * The largest size, between `max` and `min`, at which the text fits `width`
 * in `maxLines` lines or fewer. One line is preferred while it keeps at least
 * `singleFloor` of the full size; past that, two larger lines read better
 * than one shrunken one. Letter-spaced text is never wrapped. Null when
 * nothing fits at the floor.
 */
export function fitText(
  text: string,
  options: {
    max: number
    min: number
    width: number
    spec: CrTextSpec
    maxLines: number
    lineHeight?: number
    singleFloor?: number
  },
): CrText | null {
  const { max, width, spec, lineHeight = TEXT_LINE_HEIGHT } = options
  const min = Math.min(options.min, max)
  const maxLines = spec.charSpacing ? 1 : options.maxLines
  if (!text.trim()) return null
  const floor = maxLines === 1 ? min : Math.max(min, Math.round(max * (options.singleFloor ?? 0.8)))
  for (let size = Math.round(max); size >= floor; size--) {
    if (lineWidth(text, size, spec) <= width) return toText([text], size, spec, lineHeight)
  }
  if (maxLines === 1) return null
  for (let size = Math.round(max); size >= min; size--) {
    if (lineWidth(text, size, spec) <= width) return toText([text], size, spec, lineHeight)
    const lines = maxLines === 2 ? splitInTwo(text, size, width, spec) : wrapBalanced(text, size, width, spec)
    if (lines && lines.length <= maxLines && blockWidth(lines, size, spec) <= width) {
      return toText(lines, size, spec, lineHeight)
    }
  }
  return null
}

/* -------------------------------------------------------------- specs */

export const plainSpec = (font: string): CrTextSpec => ({ fontFamily: font })
export const italicSpec = (font: string): CrTextSpec => ({ fontFamily: font, fontStyle: 'italic' })
export const boldSpec = (font: string): CrTextSpec => ({ fontFamily: font, fontWeight: 700 })
export const capsSpec = (font: string): CrTextSpec => ({ fontFamily: font, charSpacing: CAPS_SPACING })

/** The name and the new title are set in contrasting styles. */
export const nameSpec = (font: string, style: CrNameStyle): CrTextSpec =>
  style === 'italic' ? italicSpec(font) : boldSpec(font)
export const titleSpec = (font: string, style: CrNameStyle): CrTextSpec =>
  style === 'italic' ? boldSpec(font) : { fontFamily: font, fontStyle: 'italic', fontWeight: 700 }

/** Small capitals lines are set in capitals by hand, so the measure is honest. */
export const caps = (text: string) => text.toLocaleUpperCase('en-US')

/* ---------------------------------------------------------------- page */

/** The safe printable column the frame is drawn in. */
export function crSafeBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

export function crFrameBox(page: StudioConfigLayoutContext): Box {
  return insetBox(crSafeBox(page), STROKE_ROOM)
}

export function crTextArea(page: StudioConfigLayoutContext): Box {
  const frame = crFrameBox(page)
  return {
    left: frame.left + PAD_X,
    top: frame.top + PAD_Y,
    width: frame.width - 2 * PAD_X,
    height: frame.height - 2 * PAD_Y,
  }
}

export function crPageFits(page: StudioConfigLayoutContext): boolean {
  const area = crTextArea(page)
  return area.width >= AREA_MIN_WIDTH && area.height >= AREA_MIN_HEIGHT
}

/** Widest a heading may run; wide trims keep it from stretching edge to edge. */
export const headingMeasure = (area: Box) => Math.min(area.width, inch(5.4))
const citationMeasure = (area: Box) => Math.min(area.width, inch(4.6))
const titleMeasure = (area: Box) => Math.min(area.width, inch(5))

/** True when a generated overline fits its line at the floor size. */
export function overFits(text: string, area: Box, font: string): boolean {
  return lineWidth(caps(text), SIZES.over.min, capsSpec(font)) <= headingMeasure(area)
}

/** True when a small-capitals line (the promotion) fits the column at the floor size. */
export function capsLineFits(text: string, area: Box, font: string): boolean {
  return lineWidth(caps(text), SIZES.promotion.min, capsSpec(font)) <= area.width
}

/** A citation reads best in four lines or fewer; five is the most a small trim may take. */
export const CITATION_LINES = 4
const CITATION_MAX_LINES = 5

/** Lines a citation takes at its floor size — the most it can ever need. */
export function citationLines(text: string, area: Box, font: string): number {
  const spec = plainSpec(font)
  return wrapTextToWidth(text, SIZES.citation.min, wrapSafeWidth(citationMeasure(area), spec), spec).length
}

/** True when a generated heading fits on one line at the floor size. */
export function headingFitsOneLine(text: string, area: Box, font: string): boolean {
  return lineWidth(text, SIZES.heading.min, boldSpec(font)) <= headingMeasure(area)
}

/* --------------------------------------------------------------- plan */

/** What the stack prints — chosen before anything is measured. */
export interface CrContent {
  emblem: boolean
  over: string
  heading: string
  lead: string
  /** '' prints a line to write the name in by hand. */
  name: string
  nameStyle: CrNameStyle
  citation: string
  promotion: string
  title: string
  signLabel: string
  dateLabel: string
  /** '' leaves the date line blank. */
  date: string
  seal: boolean
}

export type CrBlockKind =
  | 'emblem'
  | 'over'
  | 'heading'
  | 'lead'
  | 'name'
  | 'nameLine'
  | 'divider'
  | 'citation'
  | 'promotion'
  | 'title'
  | 'sign'

export interface CrBlock {
  kind: CrBlockKind
  /** Where the block sits; text is centred on `box` horizontally. */
  box: Box
  text?: CrText
}

export interface CrSlot {
  left: number
  width: number
  lineY: number
  label: CrText
  labelTop: number
  /** Printed on the line, when known. */
  date?: CrText
  dateTop?: number
}

export type CrSignArrangement = 'seal' | 'side' | 'stacked'

export interface CrSignPlan {
  arrangement: CrSignArrangement
  slots: CrSlot[]
  seal?: { cx: number; cy: number; radius: number }
  height: number
}

export interface CrPlan {
  scale: number
  frame: Box
  area: Box
  blocks: CrBlock[]
  sign: CrSignPlan
}

interface Gap {
  min: number
  weight: number
}

interface Sized {
  kind: CrBlockKind
  height: number
  width: number
  text?: CrText
  gap: Gap
}

/** Width of each signature line when the two sit side by side without a seal. */
export const sideSlotWidth = (area: Box) => Math.min(SIGN_MAX, Math.floor((area.width - SIGN_GAP) / 2))

/** True when a signature-row label fits a side-by-side line at its floor size. */
export const signLabelFits = (text: string, area: Box, font: string) =>
  lineWidth(text, SIZES.signLabel.min, plainSpec(font)) <= sideSlotWidth(area)

/** Signature slots, placed relative to the row's top-left, or null when nothing fits. */
function planSign(
  area: Box,
  content: CrContent,
  scale: number,
  font: string,
): CrSignPlan | null {
  const labelSpec = plainSpec(font)
  const dateSpec = italicSpec(font)
  const seal = Math.round(Math.min(inch(1.2), Math.max(inch(0.8), SEAL_BASE * scale)))
  const cx = boxCenterX(area)

  const fitSlot = (width: number, labelText: string) =>
    fitText(labelText, { max: SIZES.signLabel.base, min: SIZES.signLabel.min, width, spec: labelSpec, maxLines: 1 })
  const fitDate = (width: number) =>
    content.date
      ? fitText(content.date, {
          max: Math.round(SIZES.date.base * Math.min(scale, 1.15)),
          min: SIZES.date.min,
          width,
          spec: dateSpec,
          maxLines: 1,
        })
      : null

  const build = (arrangement: CrSignArrangement, slotWidth: number, at: number[], stacked: boolean): CrSignPlan | null => {
    const lefts = at.map(Math.round)
    const sign = fitSlot(slotWidth, content.signLabel)
    const dateLabel = fitSlot(slotWidth, content.dateLabel)
    const date = fitDate(slotWidth)
    if (!sign || !dateLabel || (content.date && !date)) return null
    const labelH = Math.max(sign.height, dateLabel.height)
    const room = Math.max(SIGN_ROOM, date ? date.height + 10 : 0)
    const rowHeight = (lineY: number) => lineY + SIGN_LABEL_GAP + labelH
    const slots: CrSlot[] = []
    let height = 0
    let sealPlan: CrSignPlan['seal']
    if (stacked) {
      const lineOne = room
      const lineTwo = rowHeight(lineOne) + Math.round(SIGN_ROOM * 0.35) + room
      const rows = [
        { lineY: lineOne, label: sign },
        { lineY: lineTwo, label: dateLabel, date },
      ]
      for (const row of rows) {
        slots.push({
          left: lefts[0]!,
          width: slotWidth,
          lineY: row.lineY,
          label: row.label,
          labelTop: row.lineY + SIGN_LABEL_GAP,
          ...(row.date ? { date: row.date, dateTop: row.lineY - 6 - row.date.height } : {}),
        })
      }
      height = rowHeight(lineTwo)
    } else {
      const lineY = arrangement === 'seal' ? Math.max(room, Math.ceil(seal / 2)) : room
      slots.push({ left: lefts[0]!, width: slotWidth, lineY, label: sign, labelTop: lineY + SIGN_LABEL_GAP })
      slots.push({
        left: lefts[1]!,
        width: slotWidth,
        lineY,
        label: dateLabel,
        labelTop: lineY + SIGN_LABEL_GAP,
        ...(date ? { date, dateTop: lineY - 6 - date.height } : {}),
      })
      height = rowHeight(lineY)
      if (arrangement === 'seal') {
        sealPlan = { cx, cy: lineY, radius: seal / 2 }
        height = Math.max(height, lineY + Math.ceil(seal / 2))
      }
    }
    return { arrangement, slots, seal: sealPlan, height: Math.ceil(height) }
  }

  // Beside a seal, then side by side, then one above the other.
  if (content.seal) {
    const slot = Math.min(SIGN_MAX, Math.floor((area.width - seal - 2 * SEAL_GAP) / 2))
    if (slot >= SIGN_MIN) {
      const plan = build('seal', slot, [cx - seal / 2 - SEAL_GAP - slot, cx + seal / 2 + SEAL_GAP], false)
      if (plan) return plan
    }
  }
  const side = sideSlotWidth(area)
  if (side >= SIGN_MIN) {
    const gap = Math.min(area.width - 2 * side, inch(1.1))
    const plan = build('side', side, [cx - gap / 2 - side, cx + gap / 2], false)
    if (plan) return plan
  }
  const stacked = Math.min(area.width, STACKED_WIDTH)
  if (stacked < SIGN_MIN) return null
  return build('stacked', stacked, [cx - stacked / 2], true)
}

/** Every block at one scale, measured but not yet placed. Null when something cannot fit. */
function measureStack(
  area: Box,
  content: CrContent,
  scale: number,
  font: string,
): { blocks: Sized[]; sign: CrSignPlan } | null {
  const size = (key: keyof typeof SIZES) => Math.max(SIZES[key].min, Math.round(SIZES[key].base * scale))
  const blocks: Sized[] = []
  const add = (kind: CrBlockKind, text: CrText | null, gap: Gap): boolean => {
    if (!text) return false
    blocks.push({ kind, height: text.height, width: text.width, text, gap })
    return true
  }

  if (content.emblem) {
    const h = Math.round(EMBLEM_BASE * Math.min(scale, 1.2))
    blocks.push({ kind: 'emblem', height: h, width: h, gap: { min: 0, weight: 0.7 } })
  }
  if (content.over) {
    const text = fitText(caps(content.over), {
      max: size('over'),
      min: SIZES.over.min,
      width: headingMeasure(area),
      spec: capsSpec(font),
      maxLines: 1,
    })
    if (!add('over', text, { min: 8, weight: 0.3 })) return null
  }
  if (content.heading) {
    const text = fitText(content.heading, {
      max: size('heading'),
      min: SIZES.heading.min,
      width: headingMeasure(area),
      spec: boldSpec(font),
      maxLines: 2,
      singleFloor: 0.65,
    })
    if (!add('heading', text, content.over ? { min: 4, weight: 0 } : { min: 8, weight: 0.3 })) return null
  }
  const lead = fitText(content.lead, {
    max: size('lead'),
    min: SIZES.lead.min,
    width: citationMeasure(area),
    spec: italicSpec(font),
    maxLines: 2,
  })
  if (!add('lead', lead, { min: 16, weight: 1.2 })) return null

  let nameSize = Number.POSITIVE_INFINITY
  if (content.name) {
    const text = fitText(content.name, {
      max: size('name'),
      min: SIZES.name.min,
      width: area.width,
      spec: nameSpec(font, content.nameStyle),
      maxLines: 2,
      lineHeight: 1.05,
      singleFloor: 0.7,
    })
    if (!add('name', text, { min: 8, weight: 0.45 })) return null
    nameSize = text!.fontSize
    blocks.push({ kind: 'divider', height: DIVIDER_HEIGHT, width: Math.min(Math.round(area.width * 0.55), inch(2.6)), gap: { min: 8, weight: 0.3 } })
  } else {
    const room = Math.max(NAME_ROOM_MIN, Math.round(size('name') * 1.25))
    const width = Math.min(NAME_LINE_MAX_WIDTH, Math.round(area.width * 0.88))
    if (width < NAME_LINE_MIN_WIDTH) return null
    blocks.push({ kind: 'nameLine', height: room, width, gap: { min: 6, weight: 0.45 } })
  }

  const citation = fitText(content.citation, {
    max: size('citation'),
    min: SIZES.citation.min,
    width: citationMeasure(area),
    spec: plainSpec(font),
    maxLines: CITATION_MAX_LINES,
    lineHeight: CITATION_LINE_HEIGHT,
    singleFloor: 1,
  })
  if (!add('citation', citation, { min: 10, weight: 0.45 })) return null

  const promotion = fitText(caps(content.promotion), {
    max: size('promotion'),
    min: SIZES.promotion.min,
    width: area.width,
    spec: capsSpec(font),
    maxLines: 1,
  })
  if (!add('promotion', promotion, { min: 16, weight: 1.2 })) return null

  // The name always outranks the new title.
  const title = fitText(content.title, {
    max: Math.min(size('title'), nameSize - ptToPx(4)),
    min: SIZES.title.min,
    width: titleMeasure(area),
    spec: titleSpec(font, content.nameStyle),
    maxLines: 2,
  })
  if (!add('title', title, { min: 5, weight: 0.15 })) return null

  const sign = planSign(area, content, scale, font)
  if (!sign) return null
  blocks.push({ kind: 'sign', height: sign.height, width: area.width, gap: { min: 22, weight: 1.5 } })

  // Whatever leads the stack sits against the top of the text area.
  blocks[0]!.gap = { min: 0, weight: 0.7 }
  return { blocks, sign }
}

const BOTTOM_GAP: Gap = { min: 0, weight: 0.7 }

const naturalHeight = (blocks: readonly Sized[]) =>
  blocks.reduce((sum, block) => sum + block.height + block.gap.min, 0) + BOTTOM_GAP.min

/**
 * The whole certificate, placed. The largest scale that leaves the page room
 * to breathe wins; on a small trim the stack is allowed to fill the area at
 * scale 1 or below. Null when even the smallest scale does not fit.
 */
export function planCertificate(page: StudioConfigLayoutContext, content: CrContent, font: string): CrPlan | null {
  if (!crPageFits(page)) return null
  const area = crTextArea(page)
  const frame = crFrameBox(page)

  let chosen: { scale: number; blocks: Sized[]; sign: CrSignPlan } | null = null
  for (const scale of SCALES) {
    const measured = measureStack(area, content, scale, font)
    if (!measured) continue
    const height = naturalHeight(measured.blocks)
    const limit = scale > 1 ? area.height * FILL_TARGET : area.height
    if (height <= limit) {
      chosen = { scale, ...measured }
      break
    }
  }
  if (!chosen) return null

  const gaps = [...chosen.blocks.map((b) => b.gap), BOTTOM_GAP]
  const spare = area.height - naturalHeight(chosen.blocks)
  const weights = gaps.reduce((sum, gap) => sum + gap.weight, 0)
  const extra = (gap: Gap) => (weights > 0 ? (spare * gap.weight) / weights : 0)

  let y = area.top
  const blocks: CrBlock[] = chosen.blocks.map((block) => {
    y += block.gap.min + extra(block.gap)
    const top = Math.round(y)
    const box: Box = {
      left: Math.round(boxCenterX(area) - block.width / 2),
      top,
      width: block.width,
      height: block.height,
    }
    y = top + block.height
    return { kind: block.kind, box, ...(block.text ? { text: block.text } : {}) }
  })

  const sign = blocks.find((b) => b.kind === 'sign')!
  return { scale: chosen.scale, frame, area, blocks, sign: offsetSign(chosen.sign, sign.box.top) }
}

function offsetSign(sign: CrSignPlan, top: number): CrSignPlan {
  return {
    ...sign,
    slots: sign.slots.map((slot) => ({
      ...slot,
      lineY: top + slot.lineY,
      labelTop: top + slot.labelTop,
      ...(slot.dateTop != null ? { dateTop: top + slot.dateTop } : {}),
    })),
    ...(sign.seal ? { seal: { ...sign.seal, cy: top + sign.seal.cy } } : {}),
  }
}

export const blockBottom = (block: CrBlock) => boxBottom(block.box)
