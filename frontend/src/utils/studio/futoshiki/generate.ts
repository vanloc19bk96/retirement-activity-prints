import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  unionObjectBounds,
  estimateTextBoxWidth,
  boxCenterX,
  boxCenterY,
  type Box,
} from '../studio-layout'
import { buildRect, buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  buildFutoshikiPuzzle,
  type FutoshikiSize,
  type FutoshikiDifficulty,
  type FutoshikiStyle,
  type FutoshikiSign,
  type FutoshikiPuzzle,
} from './solver'
import { buildInequalitySign } from './sign'

export {
  buildFutoshikiPuzzle,
  countSolutions,
  generateLatinSquare,
  enumerateSigns,
  isLatinSquare,
  signGlyph,
  verticalSignGlyph,
} from './solver'
export { buildInequalitySign } from './sign'
export type {
  FutoshikiSize,
  FutoshikiDifficulty,
  FutoshikiStyle,
  FutoshikiSign,
  FutoshikiPuzzle,
} from './solver'

/** Gap between cells as a fraction of cell size — room for inequality glyphs. */
const GAP_RATIO = 0.34

function parseSize(raw: unknown): FutoshikiSize {
  if (raw === 4 || raw === 5 || raw === 6 || raw === 7) return raw
  if (raw === '4' || raw === '5' || raw === '6' || raw === '7') {
    return Number(raw) as FutoshikiSize
  }
  return 5
}

function parseDifficulty(raw: unknown): FutoshikiDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function parseStyle(raw: unknown): FutoshikiStyle {
  return String(raw ?? 'mixed') === 'pure' ? 'pure' : 'mixed'
}

/**
 * Square cells with gaps between them for inequality signs.
 * Integer-aligned and re-centered in `field`.
 */
function fitGappedGrid(field: Box, size: number) {
  const side = Math.min(field.width, field.height)
  const cell = Math.max(
    1,
    Math.floor(side / (size + (size - 1) * GAP_RATIO)),
  )
  const gap = Math.max(1, Math.round(cell * GAP_RATIO))
  const width = size * cell + (size - 1) * gap
  const height = width
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)

  return {
    cell,
    gap,
    bounds: { left, top, width, height } as Box,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * (cell + gap),
      top: top + r * (cell + gap),
      width: cell,
      height: cell,
    }),
  }
}

function drawSign(
  sign: FutoshikiSign,
  grid: ReturnType<typeof fitGappedGrid>,
  tag: StudioTag,
): StudioFabricObject {
  const a = grid.cellBox(sign.a.r, sign.a.c)
  const b = grid.cellBox(sign.b.r, sign.b.c)
  // Keep the chevron inside the gutter so it does not overlap cell borders.
  const size = Math.max(8, Math.round(grid.gap * 0.42))
  const left = Math.round((boxCenterX(a) + boxCenterX(b)) / 2)
  const top = Math.round((boxCenterY(a) + boxCenterY(b)) / 2)
  return buildInequalitySign(sign, left, top, size, tag)
}

/** Four filled ink bars — even weight on every edge (stroked rects look uneven). */
function drawCellFrame(cell: Box, tag: StudioTag): StudioFabricObject[] {
  const t = STUDIO_STROKE_HAIRLINE
  const { left, top, width, height } = cell
  const bar = (l: number, tp: number, w: number, h: number) =>
    buildRect(
      {
        left: l,
        top: tp,
        width: w,
        height: h,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    )
  return [
    bar(left, top, width, t),
    bar(left, top + height - t, width, t),
    bar(left, top, t, height),
    bar(left + width - t, top, t, height),
  ]
}

function drawFutoshikiGrid(options: {
  field: Box
  puzzle: FutoshikiPuzzle
  tag: StudioTag
}): StudioFabricObject {
  const { field, puzzle, tag } = options
  const { size, givens, signs, solution } = puzzle
  const g = fitGappedGrid(field, size)
  const parts: StudioFabricObject[] = []

  const fontSize = Math.round(g.cell * 0.5)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      parts.push(...drawCellFrame(cell, tag))

      const digitOpts = {
        left: Math.round(boxCenterX(cell)),
        top: Math.round(boxCenterY(cell)),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal' as const,
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
        width: estimateTextBoxWidth(String(solution[r][c]), fontSize, cell.width),
      }

      if (givens[r][c] !== 0) {
        parts.push(
          buildText({ ...digitOpts, text: String(givens[r][c]) }, tag, 'prompt'),
        )
      }
      parts.push(
        buildText({ ...digitOpts, text: String(solution[r][c]) }, tag, 'answer'),
      )
    }
  }

  for (const s of signs) {
    parts.push(drawSign(s, g, tag))
  }

  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  return buildGroup(parts, groupBounds, tag)
}

function instructionForSize(size: FutoshikiSize): string {
  return (
    `Fill the grid so each row and column contains the numbers 1–${size}, each exactly once. ` +
    'The signs between cells show which number is bigger. The wide, open side points to the larger number'
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: FutoshikiPuzzle
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    drawFutoshikiGrid({
      field: header.body,
      puzzle,
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const style = parseStyle(config.style)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = buildFutoshikiPuzzle(size, difficulty, style, rng)

  const tag: StudioTag = {
    templateKey: 'futoshiki',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, puzzle }
  const objects = layoutPage({ ...layout, instruction: instructionForSize(size) })
  // No how-to on the key — taller body so the grid centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const futoshikiTemplate: StudioTemplateDefinition = {
  key: 'futoshiki',
  label: 'Futoshiki',
  category: 'logic',
  description:
    'Fill the grid 1 to N with no repeats in any row or column, while every greater-than sign between cells stays true. One solution, reachable by logic alone. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  // Path chevron in the thumbnail — matches export-safe polyline signs.
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter">
      <rect x="11" y="4" width="14" height="14"/><rect x="39" y="4" width="14" height="14"/>
      <rect x="11" y="26" width="14" height="14"/><rect x="39" y="26" width="14" height="14"/>
    </g>
    <g font-size="9" fill="currentColor" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">
      <text x="18" y="11">2</text>
      <text x="46" y="11">1</text>
    </g>
    <polyline points="30,8.5 34.5,11 30,13.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 5,
      options: [
        { label: '4×4 (quick)', value: 4 },
        { label: '5×5', value: 5 },
        { label: '6×6', value: 6 },
        { label: '7×7 (large)', value: 7 },
      ],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (few or no givens)', value: 'hard' },
      ],
    },
    {
      key: 'style',
      label: 'Style',
      type: 'select',
      default: 'mixed',
      options: [
        { label: 'With some given numbers', value: 'mixed' },
        { label: 'Pure (inequalities only)', value: 'pure' },
      ],
      help: 'Pure puzzles have no starting numbers, so they are solved from the signs alone.',
    },
  ],
  generate,
}
