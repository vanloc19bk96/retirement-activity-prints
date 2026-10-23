import type { ZoneRect } from '@/types/book-cover.types'
import type {
  SpineTextDirection,
  SpineTextLayout,
  SpineTextRole,
} from '@/types/book-cover-spine.types'

/** Author and publisher are set smaller than the title. */
export const SPINE_TEXT_RELATIVE_SIZE: Record<SpineTextRole, number> = {
  title: 1,
  author: 0.72,
  publisher: 0.55,
}

/** Gap between consecutive spine text items, in title ems. */
const SPINE_TEXT_GAP_EM = 1.2
/** Line box share of the spine width; leaves room for ink overshoot. */
const SPINE_TEXT_CROSS_FILL = 0.9
const MEASURE_FONT_SIZE = 100

export interface SpineTextMeasure {
  role: SpineTextRole
  /** Unwrapped line width at a 100px font size. */
  widthAt100: number
  /** Line box height at a 100px font size. */
  heightAt100: number
}

export interface SpineTextLayoutInput {
  /** Spine live area: `width` runs across the spine, `height` along it. */
  safeArea: ZoneRect
  /** Extra space kept clear at the top and bottom ends of the spine. */
  endMarginPx: number
  items: SpineTextMeasure[]
  layout: SpineTextLayout
  direction: SpineTextDirection
  /** 0–1 share of the largest size that fits. */
  textScale: number
}

export interface SpineTextPlacement {
  role: SpineTextRole
  fontSize: number
  /** Scene coordinates of the text center. */
  left: number
  top: number
  /** Fabric angle in degrees (clockwise). */
  angle: number
}

const ROLE_ORDER: SpineTextRole[] = ['title', 'author', 'publisher']

function sortByRole(items: SpineTextMeasure[]): SpineTextMeasure[] {
  return [...items].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
}

function isUsableMeasure(item: SpineTextMeasure): boolean {
  return (
    Number.isFinite(item.widthAt100) &&
    Number.isFinite(item.heightAt100) &&
    item.widthAt100 > 0 &&
    item.heightAt100 > 0
  )
}

/** Items centered on the spine vs. items pinned to the reading end. */
function splitGroups(
  items: SpineTextMeasure[],
  layout: SpineTextLayout,
): { centered: SpineTextMeasure[]; pinned: SpineTextMeasure[] } {
  const pinnedRoles: SpineTextRole[] = layout === 'split' ? ['author', 'publisher'] : ['publisher']
  return {
    centered: items.filter((item) => !pinnedRoles.includes(item.role)),
    pinned: items.filter((item) => pinnedRoles.includes(item.role)),
  }
}

/**
 * Lay spine text out along the spine. Text is sized as large as the spine
 * allows (both across and along it), then scaled by `textScale`.
 */
export function computeSpineTextLayout(input: SpineTextLayoutInput): SpineTextPlacement[] {
  const items = sortByRole(input.items.filter(isUsableMeasure))
  const crossLimit = input.safeArea.width * SPINE_TEXT_CROSS_FILL
  const axisLength = input.safeArea.height - input.endMarginPx * 2
  if (items.length === 0 || crossLimit <= 0 || axisLength <= 0) return []

  const relativeLength = (item: SpineTextMeasure): number =>
    (item.widthAt100 / MEASURE_FONT_SIZE) * SPINE_TEXT_RELATIVE_SIZE[item.role]

  // Largest title font size where every line box still fits across the spine.
  const maxByCross = Math.min(
    ...items.map(
      (item) =>
        crossLimit / ((item.heightAt100 / MEASURE_FONT_SIZE) * SPINE_TEXT_RELATIVE_SIZE[item.role]),
    ),
  )
  // ...and where the whole run (text + gaps) fits along it.
  const gapCount = items.length - 1
  const lengthPerTitlePx =
    items.reduce((sum, item) => sum + relativeLength(item), 0) + gapCount * SPINE_TEXT_GAP_EM
  const maxByLength = axisLength / lengthPerTitlePx

  const scale = Math.min(1, Math.max(0, input.textScale))
  const titleFontSize = Math.min(maxByCross, maxByLength) * scale
  if (!Number.isFinite(titleFontSize) || titleFontSize <= 0) return []

  const gap = titleFontSize * SPINE_TEXT_GAP_EM
  const lengthOf = (item: SpineTextMeasure): number => relativeLength(item) * titleFontSize
  const runLength = (run: SpineTextMeasure[]): number =>
    run.reduce((sum, item) => sum + lengthOf(item), 0) + Math.max(0, run.length - 1) * gap

  const { centered, pinned } = splitGroups(items, input.layout)

  // Positions along the reading axis, measured from where reading starts.
  const startByRole = new Map<SpineTextRole, number>()
  let cursor = axisLength - runLength(pinned)
  const pinnedStart = cursor
  for (const item of pinned) {
    startByRole.set(item.role, cursor)
    cursor += lengthOf(item) + gap
  }

  const centeredLength = runLength(centered)
  const centeredLimit = pinned.length > 0 ? pinnedStart - gap : axisLength
  const idealStart = (axisLength - centeredLength) / 2
  cursor = Math.max(0, Math.min(idealStart, centeredLimit - centeredLength))
  for (const item of centered) {
    startByRole.set(item.role, cursor)
    cursor += lengthOf(item) + gap
  }

  const readsDown = input.direction === 'top-to-bottom'
  const axisTop = input.safeArea.y + input.endMarginPx
  const axisBottom = input.safeArea.y + input.safeArea.height - input.endMarginPx
  const centerX = input.safeArea.x + input.safeArea.width / 2

  return items.map((item) => {
    const centerOnAxis = (startByRole.get(item.role) ?? 0) + lengthOf(item) / 2
    return {
      role: item.role,
      fontSize: titleFontSize * SPINE_TEXT_RELATIVE_SIZE[item.role],
      left: centerX,
      top: readsDown ? axisTop + centerOnAxis : axisBottom - centerOnAxis,
      angle: readsDown ? 90 : -90,
    }
  })
}
