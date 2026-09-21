import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
  rows,
  type Box,
} from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { cellForMirrorArea, drawMirrorPuzzle } from './draw'
import { loadMirrorSource, parseGridSize } from './patterns'
import { reflectFor, reflectSegments } from './reflect'
import type { Axis, Bitmap, DrawStyle, Segment } from './types'

const BLOCK_GUTTER = 26

interface MirrorPuzzle {
  full: Bitmap
  segments: Segment[]
  style: DrawStyle
}

function parseStyle(raw: unknown): DrawStyle {
  return String(raw ?? 'pixel') === 'line' ? 'line' : 'pixel'
}

function parseAxis(raw: unknown): Axis {
  const v = String(raw ?? 'vertical')
  if (v === 'horizontal' || v === 'both') return v
  return 'vertical'
}

function clampPuzzlesPerPage(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(2, Math.max(1, Math.round(n)))
}

function instructionFor(axis: Axis, style: DrawStyle): string {
  if (axis === 'both') {
    return (
      'One quarter of the picture is drawn. Complete the other three quarters by mirroring across ' +
      'both bold lines'
    )
  }
  if (style === 'line') {
    return (
      'Half of the picture is drawn. Complete it by drawing the matching lines on the other side of ' +
      'the bold line. Count the squares to place each mark in exactly the right spot'
    )
  }
  return (
    'Half of the picture is drawn. Complete it by drawing the mirror image on the other side of ' +
    'the bold line. Count the squares to place each mark in exactly the right spot'
  )
}

function layoutBlocks(body: Box, count: number): Box[] {
  if (count <= 1) return [body]
  return rows(body, count, BLOCK_GUTTER)
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzles: MirrorPuzzle[]
  size: number
  axis: Axis
  showCoordinates: boolean
  font: string
  instruction: string
  /** Size cells from this body (puzzle page); place/center in `instruction` body. */
  sizeInstruction?: string
}): StudioFabricObject[] {
  const {
    config,
    ctx,
    tag,
    puzzles,
    size,
    axis,
    showCoordinates,
    font,
    instruction,
    sizeInstruction,
  } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const placeBlocks = layoutBlocks(header.body, puzzles.length)
  let sizeBlocks = placeBlocks
  if (sizeInstruction !== undefined) {
    const sizeHeaderH = measureHeaderHeight(config, sizeInstruction, content.width)
    sizeBlocks = layoutBlocks(
      {
        ...content,
        top: content.top + sizeHeaderH,
        height: Math.max(1, content.height - sizeHeaderH),
      },
      puzzles.length,
    )
  }
  return [
    ...header.objects,
    ...puzzles.map((puzzle, p) =>
      drawMirrorPuzzle({
        area: placeBlocks[p]!,
        full: puzzle.full,
        segments: puzzle.segments,
        style: puzzle.style,
        size,
        axis,
        showCoordinates,
        font,
        tag,
        maxCell:
          sizeInstruction === undefined
            ? undefined
            : cellForMirrorArea(sizeBlocks[p]!, size, showCoordinates, puzzle.style),
      }),
    ),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const style = parseStyle(config.style)
  const axis = parseAxis(config.axis)
  const size = parseGridSize(config.gridSize)
  const showCoordinates = config.showCoordinates === true
  const perPage = clampPuzzlesPerPage(Number(config.puzzlesPerPage ?? 1))
  const font = String(config.fontFamily)
  if (showCoordinates) void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'mirror-draw',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const puzzles: MirrorPuzzle[] = []
  for (let p = 0; p < perPage; p++) {
    // ownerKey salts the seed so two sellers running the same job (same template,
    // same settings, same page count) never walk the same sequence of pictures.
    const rng = createRng(deriveSeed(ctx.seed, `mirror:${ctx.ownerKey ?? ''}:${p}`))
    const loaded = loadMirrorSource({
      size,
      theme: 'mixed',
      style,
      source: 'library',
      axis,
      rng,
      ownerKey: ctx.ownerKey,
    })
    const full = reflectFor(axis, loaded.grid, size)
    const segments =
      loaded.style === 'line' ? reflectSegments(axis, loaded.segments, size) : []
    puzzles.push({ full, segments, style: loaded.style })
  }

  const instruction = instructionFor(axis, style)
  const layout = {
    config,
    ctx,
    tag,
    puzzles,
    size,
    axis,
    showCoordinates,
    font,
  }
  const objects = layoutPage({ ...layout, instruction })
  // Same grid size as the puzzle page; re-center in the taller key body (no how-to).
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    sizeInstruction: instruction,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const mirrorDrawTemplate: StudioTemplateDefinition = {
  key: 'mirror-draw',
  label: 'Mirror Draw',
  category: 'spatial',
  description:
    'Complete the picture by drawing its mirror image across the line of symmetry. Grid squares make every mark easy to count and place. Includes an answer key with the finished picture.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.5">
      <rect x="12" y="4" width="40" height="32"/>
      <path d="M22 4v32M32 4v32M42 4v32M12 12h40M12 20h40M12 28h40"/>
    </g>
    <g fill="currentColor">
      <rect x="22" y="12" width="10" height="8"/><rect x="12" y="20" width="20" height="8"/>
    </g>
    <g stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"><path d="M32 4v32"/></g>
  </svg>`,
  configSchema: [
    {
      key: 'style',
      label: 'Drawing style',
      type: 'select',
      default: 'pixel',
      options: [
        { label: 'Shade the squares (pixel art)', value: 'pixel' },
        { label: 'Draw the lines', value: 'line' },
      ],
    },
    {
      key: 'axis',
      label: 'Line of symmetry',
      type: 'select',
      default: 'vertical',
      options: [
        { label: 'Vertical (left ↔ right)', value: 'vertical' },
        { label: 'Horizontal (top ↔ bottom)', value: 'horizontal' },
        { label: 'Both (four quadrants, hardest)', value: 'both' },
      ],
    },
    {
      key: 'gridSize',
      label: 'Grid size',
      type: 'select',
      default: 10,
      options: [
        { label: '8×8 (simple)', value: 8 },
        { label: '10×10', value: 10 },
        { label: '12×12 (detailed)', value: 12 },
        { label: '16×16 (advanced)', value: 16 },
      ],
    },
    {
      key: 'showCoordinates',
      label: 'Number the rows and columns',
      type: 'toggle',
      default: false,
      help: 'Makes counting squares easier.',
    },
    {
      key: 'puzzlesPerPage',
      label: 'Puzzles per page',
      type: 'number',
      default: 1,
      min: 1,
      max: 2,
      step: 1,
    },
  ],
  generate,
}
