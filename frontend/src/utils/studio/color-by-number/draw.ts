import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { estimateTextBoxWidth, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import type { Pt } from '../stained-glass/geometry'
import { CBN_TEMPLATE_KEY } from './content'
import { CBN_KEY, CBN_KEY_CAPTION, type CbnKeyLayout } from './layout'
import type { CbnInkRun, CbnLabel } from './paint'
import { cbnColor } from './palette'

/**
 * A finished page → Fabric objects: the scene and its key.
 *
 * The scene is one group: one path per line weight (so a page of a hundred
 * spaces is a handful of objects in the editor and the export), with every
 * line black and nothing filled — the paper is what gets colored — and one
 * small number per space. Strokes are uniform, so scaling the scene in the
 * editor keeps the print weights. The key is a second group: a box holding
 * each number, a try-it box (or, for color-printed books, a filled swatch)
 * and the color's name.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

/** Marks the objects a Color by Number page draws, for checks and the editor. */
export const CBN_PART_KEY = 'cbnPart'

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

/** One number, centred on its point: lining digits, one line, box hugging the glyph. */
function number(n: number, x: number, y: number, size: number, tag: StudioTag): StudioFabricObject {
  const text = String(n)
  return {
    ...buildText(
      {
        left: r2(x),
        top: r2(y),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 'normal',
        width: estimateTextBoxWidth(text, size, size * 2),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
        editable: false,
      },
      tag,
      'prompt',
    ),
    data: { [CBN_PART_KEY]: 'number' },
  }
}

export function buildCbnScene(options: {
  runs: readonly CbnInkRun[]
  labels: readonly CbnLabel[]
  box: Box
  tag: StudioTag
  /** The page's book label (`subject|version|composition|palette`). */
  label: string
  /** Stands in for the whole subtree when the page is fingerprinted. */
  canonical: string
}): StudioFabricObject {
  const { runs, labels, box, tag, label, canonical } = options
  const lines = runs
    .map((run) => inkPath(run.lines, run.width, tag))
    .filter((obj): obj is StudioFabricObject => obj !== null)
  const numbers = labels.map((l) => number(l.n, l.x, l.y, l.size, tag))
  const group = buildGroup([...lines, ...numbers], box, tag, 'prompt')
  return {
    ...group,
    data: {
      source: CBN_TEMPLATE_KEY,
      [CBN_PART_KEY]: 'scene',
      [STUDIO_CONTENT_LABEL_KEY]: label,
      [STUDIO_CANONICAL_KEY]: `${CBN_TEMPLATE_KEY}:${canonical}`,
    },
  }
}

export function buildCbnKey(options: { layout: CbnKeyLayout; tag: StudioTag; fontFamily: string; filled: boolean }): StudioFabricObject {
  const { layout, tag, fontFamily, filled } = options
  const { box, entries, swatch } = layout
  const { badge, digit, swatchW, swatchH, name, row, gap, captionH, caption, stroke } = CBN_KEY
  const parts: StudioFabricObject[] = [
    buildRect({ left: box.left, top: box.top, width: box.width, height: box.height, rx: 8, ry: 8, stroke: STUDIO_INK, strokeWidth: stroke }, tag, 'prompt'),
    buildText(
      {
        left: box.left + box.width / 2,
        top: box.top + CBN_KEY.pad + captionH / 2 - 2,
        text: CBN_KEY_CAPTION,
        fontFamily,
        fontSize: caption,
        fontWeight: 700,
        width: estimateTextBoxWidth(CBN_KEY_CAPTION, caption, box.width) + caption,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        lineHeight: 1,
        editable: false,
      },
      tag,
      'prompt',
    ),
  ]
  for (const entry of entries) {
    const color = cbnColor(entry.color)
    const cy = entry.top + row / 2
    let x = entry.left
    parts.push(buildCircle({ left: x + badge / 2, top: cy, radius: badge / 2, stroke: STUDIO_INK, strokeWidth: stroke, strokeUniform: true }, tag, 'prompt'))
    parts.push(number(entry.n, x + badge / 2, cy, digit, tag))
    x += badge + gap
    if (swatch) {
      parts.push(
        buildRect(
          {
            left: x,
            top: cy - swatchH / 2,
            width: swatchW,
            height: swatchH,
            rx: 4,
            ry: 4,
            stroke: STUDIO_INK,
            strokeWidth: stroke,
            fill: filled ? color.hex : 'transparent',
          },
          tag,
          'prompt',
        ),
      )
      x += swatchW + gap
    }
    parts.push({
      ...buildText(
        {
          left: x,
          top: cy,
          text: color.name,
          fontFamily,
          fontSize: name,
          // Measured the way the key's columns were, so a name never runs past its column.
          width: hugTextBoxWidth(color.name, name, box.left + box.width - x, { fontFamily }),
          originY: 'center',
          lineHeight: 1,
          editable: false,
        },
        tag,
        'prompt',
      ),
      data: { [CBN_PART_KEY]: 'name', color: color.id, n: entry.n },
    })
  }
  const group = buildGroup(parts, box, tag, 'prompt')
  return {
    ...group,
    data: {
      source: CBN_TEMPLATE_KEY,
      [CBN_PART_KEY]: 'key',
      legend: entries.map((e) => e.color),
    },
  }
}
