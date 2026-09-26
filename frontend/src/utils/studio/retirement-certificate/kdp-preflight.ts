import type { StudioConfigLayoutContext } from '@/types/studio-template.types'
import { boxBottom, boxRight, type Box } from '../studio-layout'
import { CR_TITLE_TEXTS } from './content'
import {
  FRAME_DEPTH,
  NAME_LINE_MIN_WIDTH,
  NAME_ROOM_MIN,
  SIGN_MIN,
  SIGN_ROOM,
  SIZES,
  crSafeBox,
  type CrBlockKind,
  type CrPlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

const inside = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.top >= outer.top - 0.5 &&
  boxRight(inner) <= boxRight(outer) + 0.5 &&
  boxBottom(inner) <= boxBottom(outer) + 0.5

/** Floors for every text block, by kind. */
const FLOORS: Partial<Record<CrBlockKind, number>> = {
  over: SIZES.over.min,
  heading: SIZES.heading.min,
  lead: SIZES.lead.min,
  name: SIZES.name.min,
  citation: SIZES.citation.min,
  promotion: SIZES.promotion.min,
  title: SIZES.title.min,
}
const MAX_LINES: Partial<Record<CrBlockKind, number>> = {
  over: 1,
  heading: 2,
  lead: 2,
  name: 2,
  citation: 5,
  promotion: 1,
  title: 2,
}

/** Text that must never reach a printed page: unfilled slots, stray values, doubled spaces. */
const MALFORMED = /[{}<>]|\bundefined\b|\bNaN\b|\bnull\b| {2}|\s[,.;]/

/**
 * The last gate before a certificate is considered export-ready.
 *
 * Fit is structural — the planner only returns blocks that meet their floors
 * — so this re-proves it, then checks what a buyer or a reviewer would
 * notice: the frame past the safe area, text reaching into the frame's
 * ornaments, blocks touching, a name or title shrunk below reading size or
 * wrapped too far, a citation that is not one clean sentence, a signature
 * line too short to sign, a date that does not fit its line, a seal on top of
 * a line, a title that is not one of ours, or a certificate that repeats one
 * already in the book when a fresh one was possible.
 */
export function runCrKdpPreflight(options: {
  page: StudioConfigLayoutContext
  plan: CrPlan
  /** The generated title, or '' when the seller typed their own. */
  generatedTitle: string
  /** True when the book already printed this title and another was available. */
  repeatsBook: boolean
}): KdpPreflightResult {
  const { page, plan, generatedTitle, repeatsBook } = options
  const errors: string[] = []
  const safe = crSafeBox(page)
  const { frame, area, blocks, sign } = plan

  if (!inside(frame, safe)) errors.push('The frame crosses the printable area.')
  if (area.left - frame.left < FRAME_DEPTH || boxRight(frame) - boxRight(area) < FRAME_DEPTH) {
    errors.push('Text would reach into the frame ornaments.')
  }
  if (area.top - frame.top < FRAME_DEPTH || boxBottom(frame) - boxBottom(area) < FRAME_DEPTH) {
    errors.push('Text would reach into the frame ornaments.')
  }

  const kinds = blocks.map((b) => b.kind)
  for (const needed of ['lead', 'citation', 'promotion', 'title', 'sign'] as const) {
    if (!kinds.includes(needed)) errors.push(`The certificate is missing its ${needed}.`)
  }
  if (!kinds.includes('name') && !kinds.includes('nameLine')) errors.push('The certificate has no name or name line.')

  let previousBottom = area.top
  for (const block of blocks) {
    const where = `The ${block.kind}`
    if (!inside(block.box, area)) errors.push(`${where} leaves the certificate’s text area.`)
    if (block.box.top < previousBottom - 0.5) errors.push(`${where} overlaps the block above it.`)
    previousBottom = boxBottom(block.box)

    const text = block.text
    if (!text) continue
    const floor = FLOORS[block.kind]
    if (floor != null && text.fontSize < floor) errors.push(`${where} is smaller than reading size.`)
    const maxLines = MAX_LINES[block.kind]
    if (maxLines != null && text.lines > maxLines) errors.push(`${where} wraps onto too many lines.`)
    if (text.width > area.width + 0.5) errors.push(`${where} is wider than the certificate.`)
    const plain = text.text.replace(/ /g, ' ').replace(/\n/g, ' ')
    if (!plain.trim() || MALFORMED.test(plain)) errors.push(`${where} text is malformed.`)
  }

  const citation = blocks.find((b) => b.kind === 'citation')?.text?.text.replace(/ /g, ' ') ?? ''
  if (citation && !/[.!]$/.test(citation.trim())) errors.push('The citation must be one complete sentence.')

  const nameLine = blocks.find((b) => b.kind === 'nameLine')
  if (nameLine && (nameLine.box.width < NAME_LINE_MIN_WIDTH || nameLine.box.height < NAME_ROOM_MIN)) {
    errors.push('The name line is too small to write on.')
  }

  const title = blocks.find((b) => b.kind === 'title')?.text?.text.replace(/ /g, ' ').replace(/\n/g, ' ') ?? ''
  if (generatedTitle && (!CR_TITLE_TEXTS.has(generatedTitle) || title !== generatedTitle)) {
    errors.push('The new title is not one of ours.')
  }
  if (repeatsBook) errors.push('This title is already on a certificate in this book.')

  const row = blocks.find((b) => b.kind === 'sign')
  if (row) {
    if (sign.slots.length !== 2) errors.push('The signature row needs a signature and a date line.')
    for (const slot of sign.slots) {
      const line: Box = { left: slot.left, top: slot.lineY, width: slot.width, height: 1 }
      if (slot.width < SIGN_MIN) errors.push('A signature line is too short to sign.')
      if (!inside(line, area) || !inside(line, row.box)) errors.push('A signature line leaves the certificate.')
      if (slot.label.width > slot.width + 0.5) errors.push('A signature label is wider than its line.')
      if (slot.labelTop + slot.label.height > boxBottom(row.box) + 0.5) errors.push('A signature label is clipped.')
      if (slot.date) {
        if (slot.date.width > slot.width + 0.5) errors.push('The date is wider than its line.')
        if ((slot.dateTop ?? 0) < row.box.top - 0.5) errors.push('The date runs into the block above.')
      } else if (slot.lineY - row.box.top < SIGN_ROOM - 0.5) {
        errors.push('A signature line has too little room above it.')
      }
    }
    const [a, b] = sign.slots
    if (a && b && a.lineY === b.lineY && a.left + a.width > b.left - 1) errors.push('The signature lines touch.')
    if (sign.seal) {
      const { cx, cy, radius } = sign.seal
      const disc: Box = { left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2 }
      if (!inside(disc, row.box)) errors.push('The seal leaves the signature row.')
      for (const slot of sign.slots) {
        if (slot.left < cx + radius && slot.left + slot.width > cx - radius) errors.push('The seal sits on a signature line.')
      }
    }
  }

  return { ok: errors.length === 0, errors }
}
