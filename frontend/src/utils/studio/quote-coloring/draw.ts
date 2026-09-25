import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import type { Pt } from '../stained-glass/geometry'
import type { QcInkRun } from './compose'
import { QC_TEMPLATE_KEY } from './content'

/**
 * A finished page → one Fabric group of black strokes.
 *
 * One path per line weight — the frame, the cartouche, the lettering, the
 * pattern — so a page is a handful of objects in the editor and in the
 * export. The saying is drawn as outlines, never as a text box: the export
 * would fill a text box's glyphs solid. Nothing is filled; the paper is what
 * gets colored, so the page is pure black line on white whatever the export
 * does. Strokes are uniform, so scaling the panel keeps the print weights.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

function inkPath(lines: readonly (readonly Pt[])[], width: number, tag: StudioTag): StudioFabricObject | null {
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    line.forEach((p, i) => {
      path.push([i === 0 ? 'M' : 'L', r2(p.x), r2(p.y)])
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    })
  }
  if (path.length === 0) return null
  return {
    type: 'path',
    path,
    // A path is placed by the centre of its own geometry (Fabric's pathOffset).
    left: r2((minX + maxX) / 2),
    top: r2((minY + maxY) / 2),
    width: r2(maxX - minX),
    height: r2(maxY - minY),
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: STUDIO_INK,
    strokeWidth: width,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: 'prompt',
  }
}

export function buildQcPanel(options: {
  runs: readonly QcInkRun[]
  box: Box
  tag: StudioTag
  /** The page's book label (`saying|style|layout|cartouche|frame|fill|set`). */
  label: string
  /** Stands in for the whole subtree when the page is fingerprinted. */
  canonical: string
}): StudioFabricObject {
  const { runs, box, tag, label, canonical } = options
  const children = runs
    .map((run) => inkPath(run.lines, run.width, tag))
    .filter((obj): obj is StudioFabricObject => obj !== null)
  const group = buildGroup(children, box, tag, 'prompt')
  return {
    ...group,
    data: {
      source: QC_TEMPLATE_KEY,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      [STUDIO_CANONICAL_KEY]: `${QC_TEMPLATE_KEY}:${canonical}`,
    },
  }
}
