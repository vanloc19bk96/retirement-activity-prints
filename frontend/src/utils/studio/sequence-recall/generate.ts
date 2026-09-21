import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import {
  contentBox,
  drawHeader,
  insetHorizontal,
  rows,
  splitLeft,
  boxCenterY,
  estimateSpacedRunWidth,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
} from '../studio-layout'
import { buildText, buildRect, buildLine, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_NORMAL,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'

const DIGITS = '0123456789'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const INSTRUCTION_SQUARES = 'Memorize each sequence, then write one character per box'
const INSTRUCTION_LINE = 'Memorize each sequence, then write it on the blank line'
const MIN_SEQ_SIZE = 14
/** Matches estimateSpacedRunWidth default pad. */
const SEQ_WIDTH_PAD = 4
const SQUARE_GAP = 4
const MIN_SQUARE = 16
const MAX_SQUARE = 36

type AnswerFormat = 'squares' | 'line'

function answerFormatFor(raw: unknown): AnswerFormat {
  return raw === 'line' ? 'line' : 'squares'
}

function alphabetFor(source: string): string {
  if (source === 'letters') return LETTERS
  return DIGITS
}

/** Unique chars when length fits the alphabet; otherwise allow repeats (e.g. digits len > 10). */
function buildSequence(rng: StudioRng, alphabet: string, len: number): string {
  const chars = alphabet.split('')
  if (len <= chars.length) {
    return rng.sample(chars, len).join(' ')
  }
  return Array.from({ length: len }, () => chars[rng.int(0, chars.length - 1)]).join(' ')
}

function glyphEmFor(isDigits: boolean): number {
  return isDigits ? 0.62 : 0.72
}

/** Keep one-line sequences inside maxWidth; width = glyph run, not full column. */
function fitSequenceSize(
  text: string,
  preferred: number,
  maxWidth: number,
  isDigits: boolean,
): number {
  if (maxWidth <= 0) return MIN_SEQ_SIZE
  const glyphEm = glyphEmFor(isDigits)
  let units = 0
  for (const ch of text) {
    units += ch === ' ' || ch === '\u00a0' ? 0.3 : glyphEm
  }
  const fitted = (maxWidth - SEQ_WIDTH_PAD) / Math.max(units, 1)
  return Math.max(MIN_SEQ_SIZE, Math.min(preferred, fitted))
}

function squareSizeFor(count: number, maxWidth: number, maxHeight: number): number {
  if (count <= 0 || maxWidth <= 0 || maxHeight <= 0) return MIN_SQUARE
  const byWidth = Math.floor((maxWidth - SQUARE_GAP * (count - 1)) / count)
  const byHeight = Math.floor(maxHeight)
  // Shrink below MIN_SQUARE when the column is tight (long sequences) so boxes stay in-bounds.
  return Math.max(10, Math.min(MAX_SQUARE, byWidth, byHeight))
}

/** One write-in square per sequence character; answers centered in each box. */
function pushAnswerSquares(
  objects: StudioFabricObject[],
  chars: string[],
  area: { left: number; top: number; width: number; height: number },
  size: number,
  seqFont: string,
  tag: StudioTag,
): void {
  // Left-align every row so equal-sized boxes share one column grid.
  const startLeft = Math.round(area.left)
  const top = Math.round(boxCenterY(area) - size / 2)
  const fontSize = Math.max(12, Math.round(size * 0.55))

  chars.forEach((ch, i) => {
    const left = startLeft + i * (size + SQUARE_GAP)
    objects.push(
      buildRect(
        {
          left,
          top,
          width: size,
          height: size,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        tag,
        'structure',
      ),
    )
    objects.push(
      buildText(
        {
          left: left + size / 2,
          top: top + size / 2,
          text: ch,
          width: estimateTextBoxWidth(ch, fontSize, size),
          fontSize,
          fontFamily: seqFont,
          fontWeight: 'normal',
          lineHeight: 1,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'answer',
      ),
    )
  })
}

/** Blank writing line + answer on the same baseline as the prompt text. */
function pushAnswerLine(
  objects: StudioFabricObject[],
  seq: string,
  area: { left: number; top: number; width: number; height: number },
  baselineY: number,
  seqFont: string,
  isDigits: boolean,
  tag: StudioTag,
): void {
  const answerMaxW = Math.max(24, area.width - 16)
  const answerSize = fitSequenceSize(seq, STUDIO_BODY_SIZE - 2, answerMaxW, isDigits)
  objects.push(
    buildLine(
      {
        x1: area.left + 8,
        y1: baselineY,
        x2: area.left + area.width - 8,
        y2: baselineY,
        stroke: STUDIO_RULE_LIGHT,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'decoration',
    ),
  )
  objects.push(
    buildText(
      {
        left: area.left + 8,
        top: baselineY,
        text: seq,
        width: estimateSpacedRunWidth(seq, answerSize, answerMaxW, {
          glyphEm: glyphEmFor(isDigits),
        }),
        fontSize: answerSize,
        fontFamily: seqFont,
        fontWeight: 'normal',
        lineHeight: 1,
        fill: STUDIO_INK_MUTED,
        originY: 'bottom',
      },
      tag,
      'answer',
    ),
  )
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const startLength = Number(config.startLength ?? 3)
  const endLength = Number(config.endLength ?? 7)
  const alphabetKey = String(config.alphabet ?? 'digits')
  const answerFormat = answerFormatFor(config.answerFormat)
  const alphabet = alphabetFor(alphabetKey)
  const font = String(config.fontFamily)
  const isDigits = alphabetKey !== 'letters'
  // Digits: Inter lining figures. Letters keep the worksheet font.
  const seqFont = isDigits ? STUDIO_DIGIT_FONT : font
  const rng = createRng(ctx.seed)
  if (isDigits) void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'sequence-recall',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const instruction = answerFormat === 'line' ? INSTRUCTION_LINE : INSTRUCTION_SQUARES
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const { objects: headerObjects, body } = drawHeader(content, config, tag, instruction)
  objects.push(...headerObjects)

  const lengthRange: number[] = []
  for (let len = startLength; len <= endLength; len++) lengthRange.push(len)
  // Mixed order — not a short→long ladder.
  const lengths = rng.shuffle(lengthRange)
  const rowBoxes = rows(body, lengths.length, 12)
  const spacedOpts = { glyphEm: glyphEmFor(isDigits) }

  // One square size for the whole page — sized to the longest row so all boxes match.
  const maxLen = Math.max(...lengthRange, endLength)
  const sampleRow = rowBoxes[0]
  const sharedSquareSize =
    answerFormat === 'squares' && sampleRow
      ? squareSizeFor(
          maxLen,
          splitLeft(sampleRow, sampleRow.width * 0.55)[1].width,
          sampleRow.height * 0.72,
        )
      : MIN_SQUARE

  // Squares are capped at MAX_SQUARE, so the longest row can end well short of the
  // right margin. Shift every row by half the slack to keep the block centered.
  const squaresBlockW =
    answerFormat === 'squares'
      ? maxLen * sharedSquareSize + SQUARE_GAP * Math.max(0, maxLen - 1)
      : 0
  const blockOffset =
    answerFormat === 'squares' && sampleRow
      ? Math.max(0, (sampleRow.width - (sampleRow.width * 0.55 + squaresBlockW)) / 2)
      : 0

  lengths.forEach((len, i) => {
    const row = rowBoxes[i]
    if (!row) return
    const seqRaw = buildSequence(rng, alphabet, len)
    const chars = seqRaw.split(' ').filter(Boolean)
    const seq = toNonBreakingSpaces(seqRaw)
    const [promptColRaw, answerColRaw] = splitLeft(row, row.width * 0.55)
    const promptCol = { ...promptColRaw, left: promptColRaw.left + blockOffset }
    const answerCol = { ...answerColRaw, left: answerColRaw.left + blockOffset }
    const promptMaxW = Math.max(24, promptCol.width - 8)
    const promptSize = fitSequenceSize(seq, STUDIO_BODY_SIZE, promptMaxW, isDigits)
    // Writing-line rows: align rule + glyphs to the prompt baseline (bottom of glyph box).
    const baselineY = Math.round(boxCenterY(promptCol) + promptSize / 2)

    objects.push(
      buildText(
        {
          left: promptCol.left,
          top: answerFormat === 'line' ? baselineY : boxCenterY(promptCol) - promptSize / 2,
          text: seq,
          width: estimateSpacedRunWidth(seq, promptSize, promptMaxW, spacedOpts),
          fontSize: promptSize,
          fontFamily: seqFont,
          fontWeight: 'normal',
          lineHeight: 1,
          ...(answerFormat === 'line' ? { originY: 'bottom' as const } : {}),
        },
        tag,
        'prompt',
      ),
    )

    if (answerFormat === 'line') {
      pushAnswerLine(objects, seq, answerCol, baselineY, seqFont, isDigits, tag)
    } else {
      pushAnswerSquares(objects, chars, answerCol, sharedSquareSize, seqFont, tag)
    }
  })

  return [{ pageRole: 'single', objects }]
}

export const sequenceRecallTemplate: StudioTemplateDefinition = {
  key: 'sequence-recall',
  label: 'Sequence Recall',
  category: 'memory',
  description:
    'Read each row of digits or letters, cover it, then write the sequence back from memory. Rows get longer down the page, and answers go in boxes or on a writing line.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 10h16M4 20h20M4 30h24"/>
      <rect x="38" y="6" width="7" height="7"/><rect x="47" y="6" width="7" height="7"/><rect x="56" y="6" width="7" height="7"/>
      <rect x="38" y="16" width="7" height="7"/><rect x="47" y="16" width="7" height="7"/><rect x="56" y="16" width="7" height="7"/>
      <rect x="38" y="26" width="7" height="7"/><rect x="47" y="26" width="7" height="7"/><rect x="56" y="26" width="7" height="7"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'startLength',
      label: 'Min length',
      type: 'number',
      default: 3,
      min: 2,
      max: 8,
      step: 1,
    },
    {
      key: 'endLength',
      label: 'Max length',
      type: 'number',
      default: 7,
      min: 3,
      max: 12,
      step: 1,
    },
    {
      key: 'alphabet',
      label: 'Alphabet',
      type: 'select',
      default: 'digits',
      options: [
        { label: 'Digits', value: 'digits' },
        { label: 'Letters', value: 'letters' },
      ],
    },
    {
      key: 'answerFormat',
      label: 'Answer format',
      type: 'select',
      default: 'squares',
      options: [
        { label: 'Squares (one box per character)', value: 'squares' },
        { label: 'Writing line', value: 'line' },
      ],
    },
  ],
  generate,
}
