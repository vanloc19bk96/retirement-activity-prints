import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  HIDDEN_MESSAGE_CONFIG_SCHEMA,
  validateHiddenMessageConfig,
} from './config'
import {
  HIDDEN_MESSAGE_AI_EMPTY_MESSAGE,
  HIDDEN_MESSAGE_DEFAULT_TITLE,
  HIDDEN_MESSAGE_INSTRUCTION,
  parseCustomMessage,
  parseDifficulty,
  parsePrintStyle,
  parseWordsFrom,
  validatePayload,
} from './content'
import { drawHiddenMessagePuzzle } from './draw'
import { buildHiddenMessagePuzzle } from './place'
import { hiddenMessagePrefetch } from './prefetch'

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: ReturnType<typeof buildHiddenMessagePuzzle>
  instruction: string
  printStyle: ReturnType<typeof parsePrintStyle>
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction, printStyle, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    ...drawHiddenMessagePuzzle({
      field: header.body,
      puzzle,
      font: String(config.fontFamily),
      tag,
      forAnswerKey,
      printStyle,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const wordsFrom = parseWordsFrom(config.wordsFrom)
  const custom = wordsFrom === 'custom-saying' ? parseCustomMessage(config.customMessage) : null
  const validated = validatePayload(ctx.remoteData, difficulty, custom?.display, printStyle)
  if (!validated) {
    throw new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
  }

  const puzzle = buildHiddenMessagePuzzle({
    message: validated.message,
    words: validated.words,
    difficulty,
    seed: ctx.seed,
    printStyle,
  })

  const tag: StudioTag = {
    templateKey: 'hidden-message-word-search',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const showInstructions = config.showInstructions !== false
  const instruction = showInstructions ? HIDDEN_MESSAGE_INSTRUCTION : ''
  const layout = { config, ctx, tag, puzzle, printStyle }

  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...layout, instruction }),
      answerSourceObjects: layoutPage({ ...layout, instruction: '', forAnswerKey: true }),
    },
  ]
}

export const hiddenMessageWordSearchTemplate: StudioTemplateDefinition = {
  key: 'hidden-message-word-search',
  label: 'Hidden Message Word Search',
  category: 'word',
  description:
    'Large-print word search for retirement books: find every word, then read the leftover letters for an original saying. AI writes a fresh list and saying each page. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: HIDDEN_MESSAGE_DEFAULT_TITLE,
  validateConfig: validateHiddenMessageConfig,
  prefetch: hiddenMessagePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="5" fill="currentColor" font-family="monospace" text-anchor="middle">
      <text x="32" y="9">R E T I R</text>
      <text x="32" y="16">E N J O Y</text>
      <text x="32" y="23">S T D A Y</text>
    </g>
    <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="8" y1="34" x2="13" y2="34"/>
      <line x1="15" y1="34" x2="20" y2="34"/>
      <line x1="22" y1="34" x2="27" y2="34"/>
      <line x1="33" y1="34" x2="38" y2="34"/>
      <line x1="40" y1="34" x2="45" y2="34"/>
      <line x1="47" y1="34" x2="52" y2="34"/>
    </g>
  </svg>`,
  configSchema: HIDDEN_MESSAGE_CONFIG_SCHEMA,
  generate,
}
