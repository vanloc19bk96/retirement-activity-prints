import type { StudioFabricObject } from '@/types/studio-template.types'
import type { PairSet, WordPair } from '@/types/studio-pairs.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  boxCenterY,
  estimateSpacedRunWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildText, buildRect, buildGroup, type StudioTag } from '../studio-fabric-builders'
import type { StudioRng } from '../studio-rng'
import { cueOf, partnerOf, type ResolvedDirection } from './direction'
import { placeObjects } from './draw-pair-link'
import { MC_OPTION_GUTTER, type PairGeometry } from './geometry'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const

function buildMcOptions(options: {
  pairs: WordPair[]
  index: number
  partner: string
  cue: string
  directions: ResolvedDirection[]
  rng: StudioRng
}): string[] {
  const { pairs, index, partner, cue, directions, rng } = options
  const partnerNorm = partner.toLowerCase()
  const cueNorm = cue.toLowerCase()
  const isUnused = (word: string) => {
    const n = word.toLowerCase()
    return n !== partnerNorm && n !== cueNorm
  }

  const others = pairs
    .map((p, i) => {
      if (i === index) return null
      return partnerOf(p, directions[i] ?? 'forward')
    })
    .filter((w): w is string => w != null && isUnused(w))
  const more = pairs.flatMap((p) => [p.left, p.right]).filter(isUnused)
  const pool = [...new Set([...others, ...more])]
  const distractors = rng.shuffle(pool).slice(0, 3)
  return rng.shuffle([partner, ...distractors]).slice(0, 4)
}

export function mcQuestionText(cue: string): string {
  return `Circle the word that went with ${cue}.`
}

/** Option chip: rounded rect with label centered in the cell. */
function drawCenteredOption(options: {
  parts: StudioFabricObject[]
  cell: Box
  label: string
  font: string
  tag: StudioTag
  optionSize: number
}): void {
  const { parts, cell, font, tag, optionSize } = options
  const label = toNonBreakingSpaces(options.label)
  const padX = cell.width < 90 ? 6 : 16
  const maxLabelW = Math.max(8, cell.width - padX)
  const size = fitFontSizeToWidth(label, maxLabelW, optionSize, 10)

  parts.push(
    buildRect(
      {
        left: cell.left,
        top: cell.top,
        width: cell.width,
        height: cell.height,
        rx: 8,
        ry: 8,
        fill: 'transparent',
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
    // Full-cell width + textAlign center keeps the label optically centered in Fabric.
    buildText(
      {
        left: cell.left,
        top: boxCenterY(cell),
        text: label,
        width: cell.width,
        fontFamily: font,
        fontSize: size,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'left',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
}

/** One centered question + 2×2 (or dense 1×4) option rects. */
export function drawMultipleChoice(
  objects: StudioFabricObject[],
  set: PairSet,
  directions: ResolvedDirection[],
  geom: PairGeometry,
  font: string,
  tag: StudioTag,
  rng: StudioRng,
): void {
  const pairs = set.pairs.slice(0, geom.count)
  const { cellH, questionGap, optionRowGap, optionSize, optionCols } = geom.mc
  const optionRows = optionCols === 4 ? 1 : 2
  const gridH = optionRows * cellH + Math.max(0, optionRows - 1) * optionRowGap
  const gridW = Math.min(geom.field.width, Math.floor(geom.field.width * 0.92))
  const cellW = Math.floor(
    (gridW - MC_OPTION_GUTTER * (optionCols - 1)) / optionCols,
  )

  pairs.forEach((pair, i) => {
    const slotTop = geom.rowY[i]
    const dir = directions[i] ?? 'forward'
    const cue = cueOf(pair, dir).toUpperCase()
    const partner = partnerOf(pair, dir)
    const question = mcQuestionText(cue)
    const questionSize = fitFontSizeToWidth(question, gridW, geom.fontSize, 11)
    const choices = buildMcOptions({
      pairs,
      index: i,
      partner,
      cue,
      directions,
      rng,
    })

    const parts: StudioFabricObject[] = []
    const questionW = estimateSpacedRunWidth(question, questionSize, gridW)
    parts.push(
      buildText(
        {
          left: gridW / 2,
          top: 0,
          text: question,
          width: questionW,
          fontFamily: font,
          fontSize: questionSize,
          lineHeight: 1,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    )

    const gridTop = questionSize + questionGap
    const cells: Box[] = [0, 1, 2, 3].map((oi) => {
      const col = oi % optionCols
      const row = Math.floor(oi / optionCols)
      return {
        left: col * (cellW + MC_OPTION_GUTTER),
        top: gridTop + row * (cellH + optionRowGap),
        width: cellW,
        height: cellH,
      }
    })

    choices.forEach((opt, oi) => {
      const letter = OPTION_LETTERS[oi] ?? String(oi + 1)
      // Dense 1×4 strips need a tighter label so long words stay on one line.
      const label =
        optionCols === 4
          ? `${letter}. ${opt.toUpperCase()}`
          : `${letter}.  ${opt.toUpperCase()}`
      drawCenteredOption({
        parts,
        cell: cells[oi]!,
        label,
        font,
        tag,
        optionSize,
      })
      if (opt.toLowerCase() === partner.toLowerCase()) {
        parts.push(
          buildRect(
            {
              left: cells[oi]!.left,
              top: cells[oi]!.top,
              width: cells[oi]!.width,
              height: cells[oi]!.height,
              rx: 8,
              ry: 8,
              fill: 'transparent',
              stroke: STUDIO_INK,
              strokeWidth: STUDIO_STROKE_NORMAL,
            },
            tag,
            'answer',
          ),
        )
      }
    })

    const rawBounds = unionObjectBounds(parts) ?? {
      left: 0,
      top: 0,
      width: gridW,
      height: gridTop + gridH,
    }
    // Keep each block inside its slot — never center past the reserved band.
    const blockH = Math.min(rawBounds.height, geom.blockH)
    const originLeft =
      geom.field.left + Math.max(0, (geom.field.width - rawBounds.width) / 2) - rawBounds.left
    const originTop = slotTop + Math.max(0, (geom.blockH - blockH) / 2) - rawBounds.top

    const placed = placeObjects(parts, originLeft, originTop)
    const bounds = unionObjectBounds(placed) ?? {
      left: geom.field.left,
      top: slotTop,
      width: rawBounds.width,
      height: blockH,
    }
    // Clamp group bottom to the field so enlivened ink cannot leave the safe area.
    const fieldBottom = geom.field.top + geom.field.height
    if (bounds.top + bounds.height > fieldBottom) {
      bounds.height = Math.max(1, fieldBottom - bounds.top)
    }
    objects.push(buildGroup(placed, bounds, tag, 'decoration'))
  })
}
