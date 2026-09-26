import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE, STUDIO_RULE_LIGHT, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { WL_FINISH_LABEL, WL_TEMPLATE_KEY, wlChangeOf, wlLevelSpec, type WlLevel } from './content'
import { WL_CLUE_LINE_HEIGHT, clueHeight, type WlLadderPlacement, type WlPagePlan } from './layout'

/**
 * A placed ladder → one Fabric group: rails and rungs, a row of squares for
 * every word, the caption and clues beside the rows, and the rung words
 * hidden for the answer page.
 *
 * Black on white. The given words print bold in their squares; the rungs'
 * squares are empty (Gentle shades the one that changes, in light gray a
 * pencil writes over). Each answer letter is its own hidden text in its own
 * square, so the answer page fills the ladder in exactly where the reader
 * would.
 */

/** Marks the objects a Word Ladder page draws, for checks and the editor. */
export const WL_PART_KEY = 'wlPart'

const r2 = (n: number) => Math.round(n * 100) / 100

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [WL_PART_KEY]: name, ...extra } }
}

function letter(options: { ch: string; x: number; y: number; size: number; tag: StudioTag; role: 'prompt' | 'answer'; name: string; row: number; col: number }): StudioFabricObject {
  const { ch, x, y, size, tag, role, name, row, col } = options
  return part(
    buildText(
      {
        left: r2(x),
        top: r2(y),
        text: ch,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        width: Math.ceil(size * 1.1),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
        editable: false,
      },
      tag,
      role,
    ),
    name,
    { row, col },
  )
}

export function buildWlLadder(options: {
  placement: WlLadderPlacement
  plan: WlPagePlan
  level: WlLevel
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { placement, plan, level, tag, font } = options
  const { ladder, block, squaresLeft, squaresTop, clueLeft, captionLines, clueLines } = placement
  const m = plan.metrics
  const words = ladder.words
  const length = words[0]!.length
  const shade = wlLevelSpec(level).shadeChange
  const rowTop = (row: number) => squaresTop + row * m.pitch
  const rowMid = (row: number) => rowTop(row) + m.cell / 2
  const parts: StudioFabricObject[] = []

  // The ladder: two rails running past the first and last word, a rung in
  // every gap between words.
  const railTop = squaresTop - m.overhang
  const railBottom = rowTop(words.length - 1) + m.cell + m.overhang
  const leftRail = squaresLeft - m.railInset - m.railWidth
  const rightRail = squaresLeft + length * m.cell + m.railInset
  for (const x of [leftRail, rightRail]) {
    parts.push(
      part(
        buildRect({ left: r2(x), top: r2(railTop), width: m.railWidth, height: r2(railBottom - railTop), fill: STUDIO_RULE, stroke: 'transparent', strokeWidth: 0, rx: 1, ry: 1 }, tag),
        'rail',
      ),
    )
  }
  const rungHeight = 3
  for (let row = 0; row < words.length - 1; row++) {
    const y = rowTop(row) + m.cell + m.rowGap / 2 - rungHeight / 2
    parts.push(
      part(
        buildRect({ left: r2(leftRail), top: r2(y), width: r2(rightRail + m.railWidth - leftRail), height: rungHeight, fill: STUDIO_RULE, stroke: 'transparent', strokeWidth: 0 }, tag),
        'rung',
      ),
    )
  }

  // A row of squares for every word.
  words.forEach((word, row) => {
    const given = row === 0 || row === words.length - 1
    const changed = !given && shade ? wlChangeOf(ladder, row) : -1
    for (let col = 0; col < length; col++) {
      parts.push(
        part(
          buildRect(
            {
              left: r2(squaresLeft + col * m.cell),
              top: r2(rowTop(row)),
              width: m.cell,
              height: m.cell,
              fill: col === changed ? STUDIO_RULE_LIGHT : STUDIO_PAPER,
              stroke: STUDIO_RULE,
              strokeWidth: STUDIO_STROKE_NORMAL,
            },
            tag,
          ),
          col === changed ? 'shade' : 'square',
          { row, col },
        ),
      )
      const x = squaresLeft + (col + 0.5) * m.cell
      parts.push(
        letter({ ch: word[col]!, x, y: rowMid(row), size: m.letterSize, tag, role: given ? 'prompt' : 'answer', name: given ? 'given' : 'answer', row, col }),
      )
    }
  })

  // Beside each row, level with it: the caption by the first word, each
  // rung's clue, and "Finish" by the last word.
  const beside = (text: string, row: number, style: 'caption' | 'clue' | 'label') => {
    const height = clueHeight(text.split('\n').length, m.clueSize)
    return buildText(
      {
        left: r2(clueLeft),
        top: r2(rowMid(row) - height / 2),
        text,
        fontFamily: font,
        fontSize: m.clueSize,
        fontWeight: style === 'caption' ? 700 : 400,
        fontStyle: style === 'label' ? 'italic' : 'normal',
        lineHeight: WL_CLUE_LINE_HEIGHT,
        width: Math.floor(plan.clueWidth),
        fill: STUDIO_INK,
      },
      tag,
      'prompt',
    )
  }
  parts.push(part(beside(captionLines.join('\n'), 0, 'caption'), 'caption'))
  clueLines.forEach((lines, i) => {
    parts.push(part(beside(lines.join('\n'), i + 1, 'clue'), 'clue', { row: i + 1 }))
  })
  parts.push(part(beside(WL_FINISH_LABEL, words.length - 1, 'label'), 'label'))

  const group = buildGroup(parts, block, tag, 'prompt')
  return {
    ...group,
    data: {
      source: WL_TEMPLATE_KEY,
      [WL_PART_KEY]: 'ladder',
      ladder: ladder.id,
      [STUDIO_CONTENT_LABEL_KEY]: ladder.id,
      // The same ladder is the same puzzle, wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${WL_TEMPLATE_KEY}:${ladder.id}`,
    },
  }
}
