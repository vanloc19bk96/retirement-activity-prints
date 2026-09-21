import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigLayoutContext,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  splitTop,
  insetBox,
  drawHeader,
  measureHeaderHeight,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildCircle,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_STROKE_NORMAL,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  type TrailPart,
  buildNodes,
  clampNodeCount,
  centerNodesInBox,
} from './nodes'
import {
  MARKER_CLEARANCE,
  buildEndpointMarker,
  fieldWithMarkerClearance,
} from './endpoint-marker'

export {
  buildSequence,
  scatterNodes,
  clampNodeCount,
  buildNodes,
  centerNodesInBox,
  rimToRimSegment,
  countTrailCircleHits,
  distToSegment,
  orderForClearTrail,
} from './nodes'
export type { TrailNode, TrailPart } from './nodes'

const RADIUS = { large: 26, medium: 22, small: 18 } as const
type CircleSize = keyof typeof RADIUS

const MIN_NODES = 10
/** The standard Trail Making test uses 25 circles. */
const MAX_NODES = 25
/** Gap under the instructions, then the compact order-preview banner. */
const BANNER_TOP_GAP = 12
const BANNER_H = 28
/** Breathing room between the banner strip and the first circle. */
const FIELD_PAD = 4

function parsePart(raw: unknown): TrailPart {
  return raw === 'B' ? 'B' : 'A'
}

function parseCircleSize(raw: unknown): CircleSize {
  if (raw === 'large' || raw === 'small') return raw
  return 'medium'
}

function instructionFor(part: TrailPart): string {
  if (part === 'B') {
    return (
      'Draw one continuous line, alternating numbers and letters in order: 1, A, 2, B, ' +
      '3, C, and so on. Don’t lift your pen. Work as fast as you can'
    )
  }
  return (
    'Draw one continuous line connecting the numbers in order: 1, 2, 3, and so on. ' +
    'Don’t lift your pen. Work as fast as you can'
  )
}

function orderPreview(part: TrailPart): string {
  // ASCII arrows/ellipsis — many catalog fonts lack →/… and PDF/SVG outline
  // export would otherwise render tofu boxes.
  return part === 'B'
    ? 'Order: 1 -> A -> 2 -> B -> 3 -> C ...'
    : 'Order: 1 -> 2 -> 3 -> 4 ...'
}

/** Split the body below the header into the order banner and the trail field. */
function splitTrailBody(body: Box): { banner: Box; field: Box } {
  const [, afterTopGap] = splitTop(body, BANNER_TOP_GAP)
  const [banner, field] = splitTop(afterTopGap, BANNER_H)
  return { banner, field }
}

/** Padded box the circles are scattered in — what caps how many can fit. */
function scatterBoxIn(field: Box): Box {
  return fieldWithMarkerClearance(insetBox(field, FIELD_PAD))
}

/**
 * Circles this page can hold without overlap. The page title and instruction
 * strip eat into the field, so the schema max is resolved the same way the
 * generator packs — otherwise a sheet set to 25 quietly drew fewer.
 */
export function resolveTrailNodeCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_NODES
  const ctx: StudioGenerateContext = {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'node-count-max',
  }
  const part = parsePart(config.part)
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(config, instructionFor(part), content.width)
  const body: Box = {
    ...content,
    top: content.top + headerH,
    height: Math.max(1, content.height - headerH),
  }
  const capacity = clampNodeCount(
    MAX_NODES,
    scatterBoxIn(splitTrailBody(body).field),
    RADIUS[parseCircleSize(config.circleSize)],
  )
  // Never fall under the schema floor — 10 circles fit on every KDP trim.
  return Math.max(MIN_NODES, capacity)
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const part = parsePart(config.part)
  const circleSize = parseCircleSize(config.circleSize)
  const radius = RADIUS[circleSize]
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)
  // Numeric node labels use Inter lining figures.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'trail-making',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(part))
  objects.push(...header.objects)

  // Small top gap under the instructions, then a compact order preview.
  const { banner, field } = splitTrailBody(header.body)
  // NBSP keeps “4 ...” on one line — Fabric soft-wraps at regular spaces.
  const bannerText = toNonBreakingSpaces(orderPreview(part))
  const bannerFontSize = Math.round(STUDIO_BODY_SIZE * 0.7)
  objects.push(
    buildText(
      {
        left: boxCenterX(banner),
        top: boxCenterY(banner),
        text: bannerText,
        width: estimateTextBoxWidth(bannerText, bannerFontSize, banner.width),
        fontFamily: font,
        fontSize: bannerFontSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  // Scatter in the padded field, then recenter the cluster in the body below the banner
  // so the trail sits in the middle of the canvas (not stuck under the header).
  const scatterBox = scatterBoxIn(field)
  const nodeCount = clampNodeCount(
    Number(config.nodeCount ?? MAX_NODES),
    scatterBox,
    radius,
  )
  const nodes = centerNodesInBox(
    buildNodes(part, nodeCount, scatterBox, radius, rng),
    field,
    radius,
    MARKER_CLEARANCE,
  )

  const fieldObjects: StudioFabricObject[] = []
  const ordered = [...nodes].sort((a, b) => a.order - b.order)
  const labelMaxW = radius * 2
  const labelPreferred = Math.max(12, Math.round(radius * 0.85))

  for (const n of nodes) {
    const circle = buildCircle(
      {
        left: n.x,
        top: n.y,
        radius,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    )
    // Fit one-line labels inside the circle; width matches the glyph run.
    const fitted = Math.max(
      10,
      Math.min(labelPreferred, labelMaxW / (n.label.length * 0.55 + 1)),
    )
    const isNumericLabel = /\d/.test(n.label)
    const label = buildText(
      {
        left: n.x,
        top: n.y,
        text: n.label,
        width: estimateTextBoxWidth(n.label, fitted, labelMaxW),
        fontFamily: isNumericLabel ? STUDIO_DIGIT_FONT : font,
        fontSize: fitted,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    )
    const nodeParts = [circle, label]
    fieldObjects.push(
      buildGroup(nodeParts, unionObjectBounds(nodeParts) ?? {
        left: n.x - radius,
        top: n.y - radius,
        width: radius * 2,
        height: radius * 2,
      }, tag),
    )
  }

  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const circleCenters = nodes.map((n) => ({ x: n.x, y: n.y }))
  const markerField = insetBox(field, 2)
  if (first) {
    fieldObjects.push(
      buildEndpointMarker({
        text: 'start',
        x: first.x,
        y: first.y,
        radius,
        font,
        tag,
        preferred: 'above',
        circles: circleCenters,
        field: markerField,
      }),
    )
  }
  if (last && last !== first) {
    fieldObjects.push(
      buildEndpointMarker({
        text: 'end',
        x: last.x,
        y: last.y,
        radius,
        font,
        tag,
        preferred: 'below',
        circles: circleCenters,
        field: markerField,
      }),
    )
  }

  const fieldBounds = unionObjectBounds(fieldObjects)
  if (fieldBounds) {
    objects.push(buildGroup(fieldObjects, fieldBounds, tag))
  }

  return [{ pageRole: 'single', objects }]
}

export const trailMakingTemplate: StudioTemplateDefinition = {
  key: 'trail-making',
  label: 'Trail Making A/B',
  category: 'focus',
  description:
    'Connect scattered circles in one continuous line: numbers only for Part A, alternating numbers and letters for Part B. The classic Trail Making Test, generated fresh each time.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <circle cx="12" cy="10" r="5"/><circle cx="40" cy="8" r="5"/><circle cx="52" cy="24" r="5"/>
      <circle cx="24" cy="28" r="5"/><circle cx="8" cy="30" r="5"/>
      <path d="M17 9.6L35 8.4M43 12L49 20M47.1 24.7L29 27.3M19 28.6L13 29.4" stroke-dasharray="2 2"/>
    </g>
    <g font-size="5" fill="currentColor" text-anchor="middle" font-family="sans-serif">
      <text x="12" y="12">1</text><text x="40" y="10">2</text><text x="52" y="26">3</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'part',
      label: 'Test part',
      type: 'select',
      default: 'A',
      options: [
        { label: 'Part A (numbers: 1→2→3)', value: 'A' },
        { label: 'Part B (numbers + letters: 1→A→2→B)', value: 'B' },
      ],
      help: 'Part B alternates numbers and letters, which is harder (it tests mental switching).',
    },
    {
      key: 'nodeCount',
      label: 'Number of circles',
      type: 'number',
      default: MAX_NODES,
      min: MIN_NODES,
      max: MAX_NODES,
      step: 1,
      maxWhen: resolveTrailNodeCountMax,
      helpWhen: (config, layout) => {
        const max = resolveTrailNodeCountMax(config, layout)
        return max >= MAX_NODES
          ? 'The standard test uses 25. Fewer is easier.'
          : `The standard test uses 25. Max ${max} for this page size and circle size, ` +
              'so no two circles overlap.'
      },
      help: 'The standard test uses 25. Fewer is easier.',
    },
    {
      key: 'circleSize',
      label: 'Circle size',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Large (easier to write in)', value: 'large' },
        { label: 'Medium', value: 'medium' },
        { label: 'Small (more space to scatter)', value: 'small' },
      ],
    },
  ],
  generate,
}
