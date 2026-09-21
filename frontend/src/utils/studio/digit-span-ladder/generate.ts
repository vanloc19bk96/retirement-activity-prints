import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  type DigitSpanDirection,
  type DigitSpanMode,
  DIRECTION_PRESETS,
  buildLadder,
  clampStart,
  clampEnd,
} from './ladder'
import {
  buildLadderPage,
  buildStudyPage,
  buildRecallPage,
  fitLadderRungs,
} from './pages'

export { buildLadder, randomDigits } from './ladder'
export type { Rung } from './ladder'

/** Standard clinical ladder — two sequences at each length. */
const TRIALS_PER_LENGTH = 2

function makeTag(
  ctx: StudioGenerateContext,
  pageRole: StudioTag['pageRole'],
): StudioTag {
  return {
    templateKey: 'digit-span-ladder',
    instanceId: ctx.instanceId,
    pageRole,
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const directionRaw = String(config.direction ?? 'forward')
  const direction = (
    directionRaw === 'backward' || directionRaw === 'both' ? directionRaw : 'forward'
  ) as DigitSpanDirection | 'both'
  const mode = (String(config.mode ?? 'cover') === 'spread' ? 'spread' : 'cover') as DigitSpanMode
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)
  // Sequences use Inter lining figures (worksheet fonts often have oldstyle digits).
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  if (direction === 'both') {
    const fwd = buildLadder(3, 9, TRIALS_PER_LENGTH, 'forward', rng)
    const bwd = buildLadder(2, 8, TRIALS_PER_LENGTH, 'backward', rng)
    return [
      buildLadderPage(config, ctx, makeTag(ctx, 'study'), fwd, 'forward', font),
      buildLadderPage(config, ctx, makeTag(ctx, 'recall'), bwd, 'backward', font),
    ]
  }

  const startLength = clampStart(
    Number(config.startLength ?? DIRECTION_PRESETS[direction].start),
  )
  const endLength = clampEnd(
    Number(config.endLength ?? DIRECTION_PRESETS[direction].end),
    startLength,
  )
  const rungs = buildLadder(startLength, endLength, TRIALS_PER_LENGTH, direction, rng)

  if (mode === 'spread') {
    // Recall rows are the limiting page — study must show exactly the same rungs.
    const shown = fitLadderRungs(config, ctx, rungs, direction)
    return [
      buildStudyPage(config, ctx, makeTag(ctx, 'study'), shown, direction, font),
      buildRecallPage(config, ctx, makeTag(ctx, 'recall'), shown, direction, font),
    ]
  }

  return [buildLadderPage(config, ctx, makeTag(ctx, 'single'), rungs, direction, font)]
}

export const digitSpanLadderTemplate: StudioTemplateDefinition = {
  key: 'digit-span-ladder',
  label: 'Digit Span Ladder',
  category: 'memory',
  description:
    'The classic digit span test as a worksheet. Read a row of numbers, cover it, then write it back from memory, forward or in reverse. Each row is one digit longer than the last.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="monospace" font-size="6.5" fill="currentColor">
      <text x="4" y="12">4 9 2</text><text x="4" y="22">8 3 6 1</text><text x="4" y="32">5 1 8 3 6</text>
    </g>
    <g stroke="currentColor" stroke-width="1" fill="none">
      <path d="M48 12h12M48 22h12M48 32h12"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      default: 'forward',
      options: [
        { label: 'Forward (say them in order)', value: 'forward' },
        { label: 'Backward (say them in reverse)', value: 'backward' },
        { label: 'Both (forward then backward)', value: 'both' },
      ],
      help: 'Backward is harder: it tests working memory, not just attention.',
    },
    {
      key: 'startLength',
      label: 'Start length',
      type: 'number',
      default: 3,
      min: 2,
      max: 6,
      step: 1,
      // Keep Start ≤ End — slider ceiling tracks the current End length.
      maxWhen: (c) => Math.min(6, Number(c.endLength ?? 9)),
      help: 'Length of the first (easiest) sequence. Must be ≤ End length.',
      visibleWhen: (c) => c.direction !== 'both',
    },
    {
      key: 'endLength',
      label: 'End length',
      type: 'number',
      default: 9,
      min: 4,
      max: 12,
      step: 1,
      // Keep End ≥ Start — slider floor tracks the current Start length.
      minWhen: (c) => Math.max(4, Number(c.startLength ?? 3)),
      help: 'Length of the last (hardest) sequence. Must be ≥ Start length.',
      visibleWhen: (c) => c.direction !== 'both',
    },
    {
      key: 'mode',
      label: 'Format',
      type: 'select',
      default: 'cover',
      options: [
        { label: 'Cover & write (one page)', value: 'cover' },
        { label: 'Study & recall (two pages)', value: 'spread' },
      ],
      visibleWhen: (c) => c.direction !== 'both',
    },
  ],
  generate,
}
