import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type { PairSet } from '@/types/studio-pairs.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  drawHeader,
  insetHorizontal,
  unionObjectBounds,
  boxCenterX,
  boxCenterY,
  type Box,
} from '../studio-layout'
import { buildImage, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  drawPairConnector,
  drawWordRect,
  placeObjects,
} from './draw-pair-link'
import {
  headerConfig,
  studyInstruction,
  MC_CONNECTOR_W,
  type PairGeometry,
} from './geometry'

const DEFAULT_NATURAL = 256

function drawOutlineImage(
  parts: StudioFabricObject[],
  cell: Box,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  tag: StudioTag,
): void {
  const nw = Math.max(1, naturalWidth)
  const nh = Math.max(1, naturalHeight)
  const scale = Math.min(cell.width / nw, cell.height / nh)
  parts.push(
    buildImage(
      {
        src,
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        originX: 'center',
        originY: 'center',
        width: nw,
        height: nh,
        scaleX: scale,
        scaleY: scale,
        crossOrigin: 'anonymous',
      },
      tag,
      'prompt',
    ),
  )
}

/** Study page: linked word cards, grouped and centered in the safe field. */
export function buildStudyPage(
  set: PairSet,
  geom: PairGeometry,
  config: StudioConfig,
  ctx: StudioGenerateContext,
): StudioPageOutput {
  const font = String(config.fontFamily)
  const tag: StudioTag = {
    templateKey: 'paired-associates',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    headerConfig(config, 'Remember these pairs'),
    tag,
    studyInstruction(),
  )
  objects.push(...header.objects)

  const pairs = set.pairs.slice(0, geom.count)
  const gridW = Math.min(geom.field.width, Math.floor(geom.field.width * 0.88))
  const cellW = Math.floor((gridW - MC_CONNECTOR_W) / 2)
  const cellH = geom.blockH
  const rowGap = geom.gap
  const parts: StudioFabricObject[] = []

  pairs.forEach((pair, i) => {
    const top = i * (cellH + rowGap)
    const leftCell: Box = { left: 0, top, width: cellW, height: cellH }
    const rightCell: Box = {
      left: cellW + MC_CONNECTOR_W,
      top,
      width: cellW,
      height: cellH,
    }

    drawWordRect({
      parts,
      cell: leftCell,
      label: pair.left.toUpperCase(),
      font,
      fontSize: geom.fontSize,
      tag,
    })

    if (pair.rightImageUrl) {
      drawOutlineImage(
        parts,
        rightCell,
        pair.rightImageUrl,
        pair.rightNaturalWidth ?? DEFAULT_NATURAL,
        pair.rightNaturalHeight ?? DEFAULT_NATURAL,
        tag,
      )
    } else {
      drawWordRect({
        parts,
        cell: rightCell,
        label: pair.right.toUpperCase(),
        font,
        fontSize: geom.fontSize,
        tag,
      })
    }

    drawPairConnector(parts, leftCell, rightCell, tag)
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

  return { pageRole: 'study', objects }
}
