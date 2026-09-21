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
import { ALPHABETS } from './sequence'
import { maxRecallQuestionCount } from './recall-questions'
import { generateJudgement } from './judgement'
import { generateRecall } from './recall'

export { buildNBackSequence } from './sequence'
export {
  isValidRecallQuestion,
  pickRecallQuestions,
  buildRecallPuzzle,
  maxRecallQuestionCount,
  recallAnchorRange,
} from './recall-questions'

const QUESTION_COUNT_MIN = 3
const QUESTION_COUNT_MAX = 12

function resolveRecallQuestionMax(config: StudioConfig): number {
  const seqLength = Math.min(20, Math.max(8, Number(config.seqLength ?? 12)))
  const n = Math.min(3, Math.max(1, Number(config.n ?? 2)))
  const fromSequence = maxRecallQuestionCount(seqLength, n)
  return Math.max(QUESTION_COUNT_MIN, Math.min(QUESTION_COUNT_MAX, fromSequence))
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const n = Math.min(3, Math.max(1, Number(config.n ?? 2)))
  const mode = String(config.mode ?? 'judgement') === 'recall' ? 'recall' : 'judgement'
  const alphabetKey = String(config.alphabet ?? 'letters')
  const symbols = ALPHABETS[alphabetKey] ?? ALPHABETS.letters
  const font = String(config.fontFamily)
  // Digits need Inter — PT Serif lacks those glyphs on export.
  // Shapes use Phosphor duotone paths (same paint as Change Detection).
  const usesDigitFont = alphabetKey === 'digits'
  const digitFont = usesDigitFont ? STUDIO_DIGIT_FONT : undefined
  const rng = createRng(ctx.seed)
  if (usesDigitFont) void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'n-back-paper',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const fontOpts = digitFont ? { digitFont } : undefined
  return mode === 'judgement'
    ? [generateJudgement(config, ctx, tag, symbols, n, font, rng, fontOpts)]
    : [generateRecall(config, ctx, tag, symbols, n, font, rng, fontOpts)]
}

export const nBackPaperTemplate: StudioTemplateDefinition = {
  key: 'n-back-paper',
  label: 'N-Back Paper',
  category: 'memory',
  description:
    'Reveal a list one row at a time and mark every item that repeats the one N rows earlier. A paper version of the classic N-back task. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  showsCanvasEditHint: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="sans-serif" font-size="8" fill="currentColor">
      <text x="6" y="12">K</text><text x="6" y="24">R</text><text x="6" y="36">K</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="46" y="6" width="10" height="8"/><rect x="46" y="18" width="10" height="8"/>
      <rect x="46" y="30" width="10" height="8"/>
      <path d="M48 34l2 2 4-4"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'n',
      label: 'N (steps back)',
      type: 'select',
      default: 2,
      options: [
        { label: '1-back (easiest)', value: 1 },
        { label: '2-back', value: 2 },
        { label: '3-back (hardest)', value: 3 },
      ],
      help: 'Compare each item to the one N positions earlier. Higher N is much harder.',
    },
    {
      key: 'mode',
      label: 'Format',
      type: 'select',
      default: 'judgement',
      options: [
        { label: 'Mark matches (cover & reveal)', value: 'judgement' },
        { label: 'Recall quiz (study & answer)', value: 'recall' },
      ],
    },
    {
      key: 'alphabet',
      label: 'Symbols',
      type: 'select',
      default: 'letters',
      options: [
        { label: 'Letters (A–Z)', value: 'letters' },
        { label: 'Digits (0–9)', value: 'digits' },
        { label: 'Shapes', value: 'shapes' },
      ],
    },
    {
      key: 'rowCount',
      label: 'Number of items',
      type: 'number',
      default: 20,
      min: 10,
      max: 30,
      step: 2,
      help: 'How long the sequence is. Longer = more sustained effort.',
      visibleWhen: (c) => c.mode === 'judgement',
    },
    {
      key: 'seqLength',
      label: 'Sequence length',
      type: 'number',
      default: 12,
      min: 8,
      max: 20,
      step: 1,
      visibleWhen: (c) => c.mode === 'recall',
    },
    {
      key: 'questionCount',
      label: 'Number of questions',
      type: 'number',
      default: 6,
      min: QUESTION_COUNT_MIN,
      max: QUESTION_COUNT_MAX,
      step: 1,
      visibleWhen: (c) => c.mode === 'recall',
      maxWhen: resolveRecallQuestionMax,
      helpWhen: (c) => {
        const max = resolveRecallQuestionMax(c)
        return `How many recall prompts. Max ${max} for this sequence length and N.`
      },
    },
  ],
  generate,
}
