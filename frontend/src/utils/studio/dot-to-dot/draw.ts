import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildCircle, buildGroup, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { estimateTextBoxWidth, type Box } from '../studio-layout'
import type { Pt } from '../stained-glass/geometry'
import { DTD_TEMPLATE_KEY } from './content'
import type { DtdPuzzle, DtdRules } from './puzzle'

/**
 * A finished puzzle → one Fabric group: the pre-drawn details, the dots, the
 * numbers, and the completed outline hidden for the answer page.
 *
 * Black on white and nothing filled but the dots themselves. Dot 1 wears a
 * ring and a bold number, so the start is the first thing a reader finds.
 * Details print lighter than the line the reader will draw, so the picture
 * they reveal is theirs. Strokes are uniform, so scaling the group in the
 * editor keeps the print weights.
 */

/** Marks the objects a Dot to Dot page draws, for checks and the editor. */
export const DTD_PART_KEY = 'dtdPart'

/** Print weights, canvas px (1 px = 0.75 pt). */
export const DTD_INK_WIDTH = {
  /** Pre-drawn details: 1.1 pt. */
  detail: 1.5,
  /** The ring round dot 1. */
  start: 1.5,
  /** The completed outline on the answer page: 1.7 pt. */
  answer: 2.25,
} as const

/** Radius of the ring round dot 1, beyond the dot. */
export const DTD_START_RING = 3.5

const r2 = (n: number) => Math.round(n * 100) / 100

function linePath(lines: readonly (readonly Pt[])[], closed: boolean, width: number, tag: StudioTag, role: StudioRole, part: string): StudioFabricObject | null {
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
    if (closed && line.length > 0) path.push(['Z'])
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
    studioRole: role,
    // The answer stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
    data: { [DTD_PART_KEY]: part },
  }
}

export function buildDtdPicture(options: {
  puzzle: DtdPuzzle
  rules: DtdRules
  box: Box
  tag: StudioTag
  /** The page's book label (`subject|shape|version`). */
  label: string
  /** Stands in for the whole subtree when the page is fingerprinted. */
  canonical: string
  /** What the picture is, for the editor's layer name and the answer page. */
  name: string
}): StudioFabricObject {
  const { puzzle, rules, box, tag, label, canonical, name } = options
  const parts: StudioFabricObject[] = []
  const details = linePath(puzzle.details, false, DTD_INK_WIDTH.detail, tag, 'prompt', 'details')
  if (details) parts.push(details)
  const answer = linePath([puzzle.dots], true, DTD_INK_WIDTH.answer, tag, 'answer', 'outline')
  if (answer) parts.push(answer)
  for (const dot of puzzle.dots) {
    if (dot.n === 1) {
      parts.push({
        ...buildCircle({ left: r2(dot.x), top: r2(dot.y), radius: rules.dotRadius + DTD_START_RING, stroke: STUDIO_INK, strokeWidth: DTD_INK_WIDTH.start, strokeUniform: true }, tag, 'prompt'),
        data: { [DTD_PART_KEY]: 'start' },
      })
    }
    parts.push({
      ...buildCircle({ left: r2(dot.x), top: r2(dot.y), radius: rules.dotRadius, fill: STUDIO_INK, stroke: STUDIO_INK, strokeWidth: 0 }, tag, 'prompt'),
      data: { [DTD_PART_KEY]: 'dot', n: dot.n },
    })
  }
  for (const dot of puzzle.dots) {
    const text = String(dot.n)
    parts.push({
      ...buildText(
        {
          left: r2(dot.label.x),
          top: r2(dot.label.y),
          text,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: rules.numberSize,
          fontWeight: dot.n === 1 ? 700 : 'normal',
          width: estimateTextBoxWidth(text, rules.numberSize, rules.numberSize * 3),
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
      data: { [DTD_PART_KEY]: 'number', n: dot.n },
    })
  }
  const group = buildGroup(parts, box, tag, 'prompt')
  return {
    ...group,
    data: {
      source: DTD_TEMPLATE_KEY,
      [DTD_PART_KEY]: 'picture',
      subject: name,
      dots: puzzle.dots.length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      [STUDIO_CANONICAL_KEY]: `${DTD_TEMPLATE_KEY}:${canonical}`,
    },
  }
}
