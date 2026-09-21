import type { StudioFabricObject } from '@/types/studio-template.types'
import type { PairSet } from '@/types/studio-pairs.types'
import { STUDIO_INK, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { unionObjectBounds, type Box } from '../studio-layout'
import { buildLine, buildGroup, type StudioTag } from '../studio-fabric-builders'
import type { StudioRng } from '../studio-rng'
import { cueOf, partnerOf, type ResolvedDirection } from './direction'
import { scramblePartners } from './scramble'
import {
  drawMatchTerminals,
  drawWordRect,
  placeObjects,
} from './draw-pair-link'
import { MATCH_GUTTER, type PairGeometry } from './geometry'

/** Matching recall: word cards + draw terminals, grouped and centered. */
export function drawMatching(
  objects: StudioFabricObject[],
  set: PairSet,
  directions: ResolvedDirection[],
  geom: PairGeometry,
  font: string,
  tag: StudioTag,
  rng: StudioRng,
): void {
  const pairs = set.pairs.slice(0, geom.count)
  const partners = pairs.map((p, i) => partnerOf(p, directions[i] ?? 'forward'))
  const perm = scramblePartners(pairs, rng)

  const gridW = Math.min(geom.field.width, Math.floor(geom.field.width * 0.92))
  const gutter = Math.max(MATCH_GUTTER, Math.floor(gridW * 0.18))
  const cellW = Math.floor((gridW - gutter) / 2)
  const cellH = geom.blockH
  const rowGap = geom.gap
  const parts: StudioFabricObject[] = []
  const leftAnchors: { x: number; y: number }[] = []
  const rightAnchors: { x: number; y: number }[] = []

  pairs.forEach((pair, i) => {
    const top = i * (cellH + rowGap)
    const leftCell: Box = { left: 0, top, width: cellW, height: cellH }
    const rightCell: Box = {
      left: cellW + gutter,
      top,
      width: cellW,
      height: cellH,
    }
    const dir = directions[i] ?? 'forward'
    const cue = cueOf(pair, dir).toUpperCase()
    const rightWord = partners[perm[i]!]!.toUpperCase()

    drawWordRect({
      parts,
      cell: leftCell,
      label: cue,
      font,
      fontSize: geom.fontSize,
      tag,
    })
    drawWordRect({
      parts,
      cell: rightCell,
      label: rightWord,
      font,
      fontSize: geom.fontSize,
      tag,
    })

    const terminals = drawMatchTerminals(parts, leftCell, rightCell, tag)
    leftAnchors.push(terminals.left)
    rightAnchors.push(terminals.right)
  })

  // Hidden answer: cue row i → display row that holds its true partner.
  pairs.forEach((_, i) => {
    const targetRow = perm.indexOf(i)
    const from = leftAnchors[i]!
    const to = rightAnchors[targetRow]!
    parts.push(
      buildLine(
        {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'answer',
      ),
    )
  })

  const rawBounds = unionObjectBounds(parts) ?? {
    left: 0,
    top: 0,
    width: gridW,
    height: pairs.length * cellH + Math.max(0, pairs.length - 1) * rowGap,
  }
  const originLeft =
    geom.field.left + Math.max(0, (geom.field.width - rawBounds.width) / 2) - rawBounds.left
  const originTop =
    geom.field.top + Math.max(0, (geom.field.height - rawBounds.height) / 2) - rawBounds.top
  const placed = placeObjects(parts, originLeft, originTop)
  const bounds = unionObjectBounds(placed) ?? {
    left: geom.field.left,
    top: geom.field.top,
    width: rawBounds.width,
    height: rawBounds.height,
  }
  objects.push(buildGroup(placed, bounds, tag, 'decoration'))
}
