import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import { SG_TEMPLATE_KEY } from './content'
import type { Pt } from './geometry'
import type { SgInkRun } from './mosaic'

/**
 * A finished panel → one Fabric group of black strokes.
 *
 * One path per line weight, so a page of a few hundred pieces of glass is a
 * handful of objects in the editor and in the export, and every line of a
 * weight is drawn with the same pen. Strokes are uniform: scaling the panel
 * in the editor keeps the print weights. Nothing is filled — the paper is the
 * glass — so the page is pure black line on white, whatever the export does.
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

export function buildSgPanel(options: {
  runs: readonly SgInkRun[]
  box: Box
  tag: StudioTag
  /** The page's book label (`subject|version|composition|style`). */
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
      source: SG_TEMPLATE_KEY,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      [STUDIO_CANONICAL_KEY]: `${SG_TEMPLATE_KEY}:${canonical}`,
    },
  }
}
