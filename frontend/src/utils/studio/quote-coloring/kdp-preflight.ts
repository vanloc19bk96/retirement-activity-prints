import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { distToRing, pointInRing, pt, type Pt } from '../stained-glass/geometry'
import { QC_ALL_INK_WEIGHTS, QC_MIN_MOTIFS, type QcDesign, type QcPage } from './compose'
import { qcDesignKey, sayingsRepeat, validQcSaying, type QcBookEntry, type QcDetailSpec } from './content'
import { glyphText, letteredText, readBack } from './lettering'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/**
 * Share of the panel covered by ink. A line-art coloring page prints around
 * 4–15%; above this the lines crowd into black mass, below it the page is
 * nearly blank.
 */
const MAX_INK_SHARE = 0.24
const MIN_INK_SHARE = 0.025
/** Clear paper between the lettering and the line round it, at the least. */
const MIN_LETTER_CLEARANCE = 8

/**
 * The last gate before a page is accepted.
 *
 * The page has already been printed to a grid and every region measured
 * (`compose.ts`); this re-proves the result as a whole: the lettering says
 * exactly the saying, letter for letter; it is big enough to be the page's
 * subject; it sits clear inside its cartouche; no pattern line enters the
 * lettering's space or leaves the frame; every region clears its floor; the
 * page is line art, not a thicket or a blank; and the book does not already
 * print this saying or this exact page. Any failure sends the page back to
 * be rebuilt, never into the book.
 */
export function runQcKdpPreflight(options: {
  saying: string
  design: QcDesign
  page: QcPage
  detail: QcDetailSpec
  book?: readonly QcBookEntry[]
}): KdpPreflightResult {
  const { saying, design, page, detail, book = [] } = options
  const errors: string[] = []

  if (validQcSaying(saying) !== saying) errors.push('The saying is not one the page can letter exactly.')
  const expected = letteredText(saying, design.style.caps)
  if (readBack(page.lettering) !== expected) errors.push('The lettering does not read as the saying.')
  if (glyphText(page.lettering) !== expected.replace(/ /g, '')) errors.push('A letter of the saying is missing or out of place.')
  if (page.lettering.text !== expected) errors.push('The lettering was set from different text.')
  if (page.lettering.size < design.style.minEm - 0.01) errors.push('The lettering prints below its colorable size.')

  // Every letter inside the lettering's space, clear of its edge.
  let tightest = Infinity
  for (const line of page.lettering.lines) {
    for (const glyph of line.glyphs) {
      for (const ring of glyph.rings) {
        for (let i = 0; i < ring.length; i += 3) {
          const p = ring[i]!
          if (!pointInRing(p, page.letterArea)) {
            errors.push('A letter runs outside its space.')
            break
          }
          tightest = Math.min(tightest, distToRing(p, page.letterArea))
        }
      }
    }
  }
  if (tightest < MIN_LETTER_CLEARANCE) errors.push('The lettering crowds the line around it.')

  // No pattern line in the lettering's space or outside the frame.
  const strays = (pts: readonly Pt[]) => pts.some((p) => pointInRing(p, page.cartouche) || !pointInRing(p, page.fieldEdge))
  if (page.motifs.some((m) => m.lines.some(strays))) errors.push('The pattern runs into the lettering or past the frame.')
  if (page.motifs.length < QC_MIN_MOTIFS) errors.push('The pattern is too sparse.')

  // Clear paper round every motif: none touches another, the frame or the cartouche.
  const room = detail.gap * 0.9
  const crowded = page.motifs.some((m, i) =>
    page.motifs.some((o, j) => j > i && Math.hypot(m.cx - o.cx, m.cy - o.cy) < m.r + o.r + room) ||
    distToRing(pt(m.cx, m.cy), page.fieldEdge) < m.r + room ||
    distToRing(pt(m.cx, m.cy), page.cartouche) < m.r + room,
  )
  if (crowded) errors.push('Two shapes in the pattern touch.')

  const r = page.report
  if (r.narrowest < detail.floor.minWidth || r.smallest < detail.floor.minArea) errors.push('A space in the pattern is too small to color.')
  if (r.inkShare > MAX_INK_SHARE) errors.push('The lines are too crowded to color between.')
  if (r.inkShare < MIN_INK_SHARE) errors.push('The design is nearly blank.')

  if (book.some((entry) => sayingsRepeat(entry.saying, saying))) errors.push('This book already prints this saying.')
  const key = qcDesignKey({ saying, style: design.style.id, layout: design.layout, cartouche: design.cartouche, frame: design.frame, fill: design.fill, set: design.set })
  if (book.some((entry) => entry.saying === saying && qcDesignKey(entry) === key)) errors.push('This book already has this exact page.')

  return { ok: errors.length === 0, errors }
}

/**
 * The page as drawn: every mark inside the box it was given, every stroke
 * black at one of the page's print weights, no fill anywhere (no grey, no
 * solid black) and no text object — the saying is outlines, so a stray text
 * box would be the one thing on the page not lettered from the checked text.
 */
export function checkQcDrawnPanel(panel: StudioFabricObject, box: Box): string[] {
  const errors: string[] = []
  if (panel.type !== 'group' || !panel.objects?.length) return ['The panel was not drawn.']
  const cx = panel.left + (panel.width ?? 0) / 2
  const cy = panel.top + (panel.height ?? 0) / 2
  for (const child of panel.objects) {
    if (child.type !== 'path' || !child.path?.length) {
      errors.push('The panel holds something other than line art.')
      continue
    }
    if (child.stroke !== STUDIO_INK) errors.push('A line in the panel is not black.')
    if (child.fill && child.fill !== 'transparent') errors.push('A shape in the panel is filled in.')
    if (!QC_ALL_INK_WEIGHTS.has(child.strokeWidth ?? 0)) errors.push('A line in the panel is not at a print weight.')
    const half = (child.strokeWidth ?? 0) / 2
    // Path data keeps page coordinates; only a child's left/top are group-relative.
    for (const command of child.path) {
      const x = Number(command[1])
      const y = Number(command[2])
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        errors.push('The panel has a broken line.')
        break
      }
      if (x - half < box.left - 0.5 || x + half > box.left + box.width + 0.5 || y - half < box.top - 0.5 || y + half > box.top + box.height + 0.5) {
        errors.push('A line runs outside the panel.')
        break
      }
    }
  }
  if (Math.abs(cx - (box.left + box.width / 2)) > 0.5 || Math.abs(cy - (box.top + box.height / 2)) > 0.5) {
    errors.push('The panel is not where it was laid out.')
  }
  return [...new Set(errors)]
}
