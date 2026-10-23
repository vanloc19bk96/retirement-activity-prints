import type { ZoneRect } from '@/types/book-cover.types'
import type {
  CoverFace,
  CoverFaceArrangement,
  CoverFaceTextAlign,
  CoverFaceTextRole,
} from '@/types/book-cover-face.types'

/** Default font size of each role, as a share of the text area width. */
export const COVER_FACE_FONT_SIZE_SHARE: Record<CoverFaceTextRole, number> = {
  title: 0.11,
  subtitle: 0.045,
  author: 0.05,
  headline: 0.055,
  description: 0.03,
}

/** Gap above each role, in ems of the face's lead role (title / headline). */
const GAP_BEFORE_EM: Record<CoverFaceTextRole, number> = {
  title: 0,
  subtitle: 0.35,
  author: 0.6,
  headline: 0,
  description: 0.6,
}

/** In the classic arrangement the author sits at the bottom of the cover. */
const PINNED_ROLES: CoverFaceTextRole[] = ['author']
/** Minimum space between the top block and the pinned author, in lead ems. */
const CLASSIC_GROUP_GAP_EM = 0.8

const LEAD_ROLE: Record<CoverFace, CoverFaceTextRole> = { front: 'title', back: 'headline' }

export interface CoverFaceTextMeasure {
  role: CoverFaceTextRole
  /** Wrapped line box height at the font size being tried. */
  height: number
}

export interface CoverFaceTextLayoutInput {
  face: CoverFace
  area: ZoneRect
  /** Non-empty items, in reading order. */
  items: CoverFaceTextMeasure[]
  arrangement: CoverFaceArrangement
  /** Font size of the lead role (title / headline) being tried. */
  leadFontSize: number
}

export interface CoverFaceTextPlacement {
  role: CoverFaceTextRole
  /** Scene y of the item's top edge. */
  top: number
}

export interface CoverFaceTextLayoutResult {
  placements: CoverFaceTextPlacement[]
  /** Height the arrangement needs; above `area.height` means the text must shrink. */
  requiredHeight: number
}

function runHeight(items: CoverFaceTextMeasure[], leadFontSize: number): number {
  return items.reduce(
    (sum, item, index) => sum + item.height + (index > 0 ? GAP_BEFORE_EM[item.role] * leadFontSize : 0),
    0,
  )
}

function stack(items: CoverFaceTextMeasure[], startTop: number, leadFontSize: number): CoverFaceTextPlacement[] {
  let cursor = startTop
  return items.map((item, index) => {
    if (index > 0) cursor += GAP_BEFORE_EM[item.role] * leadFontSize
    const placement = { role: item.role, top: cursor }
    cursor += item.height
    return placement
  })
}

/** Default lead font size (title / headline) for a text area, before `textScale`. */
export function coverFaceLeadFontSize(face: CoverFace, area: ZoneRect): number {
  return area.width * COVER_FACE_FONT_SIZE_SHARE[LEAD_ROLE[face]]
}

/** Font size of `role` relative to its face's lead role. */
export function coverFaceRelativeFontSize(face: CoverFace, role: CoverFaceTextRole): number {
  return COVER_FACE_FONT_SIZE_SHARE[role] / COVER_FACE_FONT_SIZE_SHARE[LEAD_ROLE[face]]
}

/** Stack the face text inside `area` for the chosen arrangement. */
export function computeCoverFaceTextLayout(input: CoverFaceTextLayoutInput): CoverFaceTextLayoutResult {
  const { area, items, leadFontSize } = input
  if (items.length === 0) return { placements: [], requiredHeight: 0 }

  // Classic only applies to the front; anything else falls back to a top stack.
  const arrangement =
    input.arrangement === 'classic' && input.face !== 'front' ? 'top' : input.arrangement

  if (arrangement === 'classic') {
    const topRun = items.filter((item) => !PINNED_ROLES.includes(item.role))
    const pinnedRun = items.filter((item) => PINNED_ROLES.includes(item.role))
    const topHeight = runHeight(topRun, leadFontSize)
    const pinnedHeight = runHeight(pinnedRun, leadFontSize)
    const groupGap = topRun.length > 0 && pinnedRun.length > 0 ? CLASSIC_GROUP_GAP_EM * leadFontSize : 0
    return {
      placements: [
        ...stack(topRun, area.y, leadFontSize),
        ...stack(pinnedRun, area.y + area.height - pinnedHeight, leadFontSize),
      ],
      requiredHeight: topHeight + groupGap + pinnedHeight,
    }
  }

  const total = runHeight(items, leadFontSize)
  const startTop =
    arrangement === 'top'
      ? area.y
      : arrangement === 'bottom'
        ? area.y + area.height - total
        : area.y + (area.height - total) / 2
  return { placements: stack(items, startTop, leadFontSize), requiredHeight: total }
}

/** Anchor x for a text box with the given alignment (`originX` matches the alignment). */
export function coverFaceAnchorX(area: ZoneRect, align: CoverFaceTextAlign): number {
  if (align === 'left') return area.x
  if (align === 'right') return area.x + area.width
  return area.x + area.width / 2
}
