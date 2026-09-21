import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import { SLOT_WIDTH_EM, buildCipher } from './cipher'
import { CRYPTOGRAM_CONFIG_SCHEMA } from './config'
import {
  CRYPTOGRAM_AI_EMPTY_MESSAGE,
  CRYPTOGRAM_DEFAULT_TITLE,
  CRYPTOGRAM_INSTRUCTION,
  MAX_SLOT_FONT,
  defaultTitleFor,
  minSlotFont,
  parseLength,
  parsePrintStyle,
  puzzleCountFor,
  selectAiSayings,
  validateCryptogramConfig,
} from './content'
import { drawCryptograms, type CryptogramPuzzle } from './draw'
import { runCryptogramKdpPreflight } from './kdp-preflight'
import {
  CRYPTOGRAM_BAND_GUTTER,
  CRYPTOGRAM_INDEX_W,
  countFittingSayings,
} from './layout'
import { cryptogramPrefetch } from './prefetch'

export { validateCryptogramConfig }

function withDefaultTitle(config: StudioConfig): StudioConfig {
  const title = defaultTitleFor(config)
  return title ? { ...config, title } : config
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, CRYPTOGRAM_INSTRUCTION)
  const fontSize = STUDIO_BODY_SIZE - 4
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily),
          fontSize,
          width: header.body.width * 0.85,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    ],
  }
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzles: CryptogramPuzzle[]
  font: string
  instruction: string
  minFont: number
  maxFont: number
}): { objects: StudioFabricObject[]; fontSizes: number[] } {
  const { config, ctx, tag, puzzles, font, instruction, minFont, maxFont } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  const fontSizes = drawCryptograms(objects, {
    field: header.body,
    puzzles,
    font,
    codeFont: STUDIO_DIGIT_FONT,
    tag,
    minFont,
    maxFont,
  })
  return { objects, fontSizes }
}

function puzzlesFromRemote(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): CryptogramPuzzle[] {
  const length = parseLength(config.length)
  const need = puzzleCountFor(config)
  const remote = ctx.remoteData as CryptogramResponse | undefined
  const quotes = selectAiSayings(remote?.items, { count: need, length }).slice(0, need)
  return quotes.map((plain, i) => {
    const rng = createRng(deriveSeed(ctx.seed, `cipher:${i}`))
    return { plain, cipher: buildCipher(rng) }
  })
}

function fitPuzzles(
  puzzles: CryptogramPuzzle[],
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  minFont: number,
): CryptogramPuzzle[] {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, CRYPTOGRAM_INSTRUCTION)
  const n = countFittingSayings({
    sayings: puzzles.map((p) => p.plain),
    bandWidth: header.body.width - CRYPTOGRAM_INDEX_W,
    fieldHeight: header.body.height,
    slotEm: SLOT_WIDTH_EM,
    minFont,
    maxFont: MAX_SLOT_FONT,
    bandGutter: CRYPTOGRAM_BAND_GUTTER,
  })
  return puzzles.slice(0, n)
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const length = parseLength(config.length)
  const printStyle = parsePrintStyle(config.printStyle)
  const minFont = minSlotFont(printStyle)
  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'cryptogram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const built = puzzlesFromRemote(config, ctx)
  if (built.length === 0) {
    return [errorPage(ctx, pageConfig, tag, CRYPTOGRAM_AI_EMPTY_MESSAGE)]
  }

  const puzzles = fitPuzzles(built, ctx, pageConfig, tag, minFont)
  if (puzzles.length === 0) {
    return [errorPage(ctx, pageConfig, tag, CRYPTOGRAM_AI_EMPTY_MESSAGE)]
  }

  const showInstructions = config.showInstructions !== false
  const instruction = showInstructions ? CRYPTOGRAM_INSTRUCTION : ''
  const layout = {
    config: pageConfig,
    ctx,
    tag,
    puzzles,
    font,
    minFont,
    maxFont: MAX_SLOT_FONT,
  }
  const puzzlePage = layoutPage({ ...layout, instruction })
  const answerPage = layoutPage({ ...layout, instruction: '' })

  const preflight = runCryptogramKdpPreflight({
    puzzles,
    length,
    minFont,
    fontSizes: puzzlePage.fontSizes,
  })
  if (!preflight.ok) {
    return [errorPage(ctx, pageConfig, tag, preflight.errors[0] ?? CRYPTOGRAM_AI_EMPTY_MESSAGE)]
  }

  return [
    {
      pageRole: 'single',
      objects: puzzlePage.objects,
      answerSourceObjects: answerPage.objects,
    },
  ]
}

export const cryptogramTemplate: StudioTemplateDefinition = {
  key: 'cryptogram',
  label: 'Cryptogram',
  category: 'word',
  description:
    'Large-print retirement cryptogram. AI writes original coded sayings for any retirement theme. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: CRYPTOGRAM_DEFAULT_TITLE,
  validateConfig: validateCryptogramConfig,
  prefetch: cryptogramPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1">
      <path d="M6 16h7M16 16h7M26 16h7M40 16h7M50 16h7"/>
      <path d="M6 30h7M16 30h7M26 30h7M36 30h7M46 30h7"/>
    </g>
    <g font-family="monospace" font-size="6" fill="currentColor" text-anchor="middle">
      <text x="9.5" y="24">Q</text><text x="19.5" y="24">M</text><text x="29.5" y="24">B</text>
      <text x="43.5" y="24">X</text><text x="53.5" y="24">K</text>
    </g>
  </svg>`,
  configSchema: CRYPTOGRAM_CONFIG_SCHEMA,
  generate,
}
