import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { FIF_CONFIG_SCHEMA, validateFifConfig } from './config'
import {
  FIF_AI_EMPTY_MESSAGE,
  FIF_BUILD_FAILED_MESSAGE,
  FIF_DEFAULT_TITLE,
  FIF_PAGE_TOO_SMALL_MESSAGE,
  FIF_TEMPLATE_KEY,
  bookStoryLabel,
  parseFifPayload,
  selectFifStories,
} from './content'
import { drawStoryPage, drawWordPage } from './draw'
import { fitFif } from './fit'
import { runFifKdpPreflight } from './kdp-preflight'
import { fifContentBox, fifInstructions, fifWorstCasePlan } from './layout'
import { FIF_REQUEST_COUNT, fillInFunniesPrefetch } from './prefetch'

export { validateFifConfig }

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(fifContentBox(ctx), config, tag, fifInstructions(config).words)
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
          fontSize: STUDIO_BODY_SIZE - 4,
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

/**
 * The word list, then the story — one activity, two steps, two pages (three
 * when a small trim needs the story to continue).
 *
 * Measured first, filled second, checked third. The worst-case plan fixes type
 * sizes, list columns and blank width from the trim alone, so the form's note
 * is what prints. The prefetched stories are validated again here — whatever
 * reached `remoteData` — then held to that plan; a story that will not fit is
 * passed over for the next. The preflight then proves every prompt has its
 * blank and every blank its prompt before anything is returned.
 *
 * The word list comes first and shows only the kinds of word, never the
 * story: choosing words blind is the game.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instructions = fifInstructions(config)
  const tag: StudioTag = { templateKey: FIF_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  const promised = fifWorstCasePlan({ page: ctx, config, font })
  if (!promised) return fail(FIF_PAGE_TOO_SMALL_MESSAGE)

  const stories = selectFifStories(parseFifPayload(ctx.remoteData), { cap: FIF_REQUEST_COUNT })
  if (stories.length === 0) return fail(FIF_AI_EMPTY_MESSAGE)

  const fitted = fitFif(stories, promised, font)
  if (!fitted) return fail(FIF_BUILD_FAILED_MESSAGE)

  const preflight = runFifKdpPreflight({ fitted, fields: promised.fields, family: font })
  if (!preflight.ok) return fail(preflight.errors[0] ?? FIF_BUILD_FAILED_MESSAGE)

  const box = fifContentBox(ctx)
  const wordsHeader = drawHeader(box, config, tag, instructions.words)
  const wordObjects: StudioFabricObject[] = [...wordsHeader.objects]
  drawWordPage(wordObjects, {
    field: wordsHeader.body,
    plan: fitted.words,
    kinds: fitted.story.blanks,
    font,
    tag,
  })

  const label = bookStoryLabel(fitted.story)
  const storyPages = fitted.pages.map((page, index): StudioPageOutput => {
    // Every page keeps the title so a reader flipping back knows where they
    // are; only the first story page repeats the how-to.
    const header = drawHeader(box, config, tag, index === 0 ? instructions.story : '')
    const objects: StudioFabricObject[] = [...header.objects]
    drawStoryPage(objects, {
      field: header.body,
      plan: fitted.storyPlan,
      page,
      font,
      tag,
      label: index === 0 ? label : undefined,
    })
    return { pageRole: 'single', objects }
  })

  return [{ pageRole: 'single', objects: wordObjects }, ...storyPages]
}

export const fillInFunniesTemplate: StudioTemplateDefinition = {
  key: FIF_TEMPLATE_KEY,
  label: 'Fill-in Funnies',
  category: 'word',
  description:
    'Retirement Edition: a laugh-out-loud word game for parties, couples and keepsake books. Step 1: write a word for each numbered prompt — a describing word, a food, a coworker’s name — without peeking. Step 2: copy them into a short, original retirement story and read it aloud. Every story is checked so each blank reads right with any word; fresh stories every time, never repeated within your book. Type size and layout are fitted to your page.',
  pageCount: 2,
  producesAnswerKey: false,
  defaultPageTitle: FIF_DEFAULT_TITLE,
  validateConfig: validateFifConfig,
  prefetch: fillInFunniesPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="3" font-weight="700" fill="currentColor">
      <text x="3" y="8">1.</text>
      <text x="3" y="16">2.</text>
      <text x="3" y="24">3.</text>
      <text x="3" y="32">4.</text>
    </g>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M7.5 7h9M7.5 15h7M7.5 23h10M7.5 31h8"/>
    </g>
    <g stroke="currentColor" stroke-width="0.6">
      <path d="M19 8h9M19 16h9M19 24h9M19 32h9"/>
    </g>
    <path d="M32 3v34" stroke="currentColor" stroke-width="0.4" opacity="0.4"/>
    <g stroke="currentColor" stroke-width="0.7" stroke-linecap="round" opacity="0.65">
      <path d="M36 8h8M53 8h7M36 15h3M51 15h9M36 22h14M36 29h6M54 29h6M36 36h12"/>
    </g>
    <g stroke="currentColor" stroke-width="0.6">
      <path d="M46 8h6M41 15h9M44 29h9"/>
    </g>
    <g font-family="sans-serif" font-size="2.2" font-weight="700" fill="currentColor">
      <text x="44.6" y="7.4">1</text>
      <text x="39.4" y="14.4">2</text>
      <text x="42.4" y="28.4">3</text>
    </g>
  </svg>`,
  configSchema: FIF_CONFIG_SCHEMA,
  generate,
}
