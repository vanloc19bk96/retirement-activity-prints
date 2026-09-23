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
import { PICTURE_REBUS_CONFIG_SCHEMA } from './config'
import {
  PICTURE_REBUS_BUILD_FAILED_MESSAGE,
  PICTURE_REBUS_DEFAULT_TITLE,
  PICTURE_REBUS_PAGE_TOO_SMALL_MESSAGE,
  selectPictureRebusPuzzles,
} from './content'
import { drawPictureRebusRow } from './draw'
import { runPictureRebusKdpPreflight } from './kdp-preflight'
import {
  pictureRebusBodyField,
  pictureRebusContentBox,
  pictureRebusRowBoxes,
  planPictureRebusPage,
} from './layout'
import { parsePictureRebusLevel, pictureRebusInstruction } from './levels'

const TEMPLATE_KEY = 'picture-rebus'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(pictureRebusContentBox(ctx), config, tag, instruction)
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
 * One page of picture puzzles, and the solution page that answers it.
 *
 * The order is the whole reliability story. The page is measured first, against
 * the worst puzzle this level can deal rather than against the ones it is about
 * to draw, so a book's pages all print at one size. Only then are the puzzles
 * drawn from the bank, and only then is the whole page — puzzles and plan
 * together — put through preflight. Nothing is kept unless all of it passes: a
 * page with one broken rebus on it is not nine good puzzles, it is a page a
 * reader stops trusting.
 *
 * There is no separate solution build. Every answer letter is already on the
 * page as a hidden object, so the shared answer-key pass reveals them exactly
 * where they sit and drops the instruction line — which means the solution page
 * cannot drift out of alignment with the puzzle page, because it *is* the
 * puzzle page.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parsePictureRebusLevel(config)
  const instruction = pictureRebusInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  const plan = planPictureRebusPage({ page: ctx, config, level, instruction, font })
  if (!plan) return fail(PICTURE_REBUS_PAGE_TOO_SMALL_MESSAGE)

  const puzzles = selectPictureRebusPuzzles({
    level,
    seed: ctx.seed,
    count: plan.itemCount,
  })
  if (puzzles.length < plan.itemCount) return fail(PICTURE_REBUS_BUILD_FAILED_MESSAGE)

  const preflight = runPictureRebusKdpPreflight({ puzzles, plan })
  if (!preflight.ok) return fail(preflight.errors[0] ?? PICTURE_REBUS_BUILD_FAILED_MESSAGE)

  const header = drawHeader(pictureRebusContentBox(ctx), config, tag, instruction)
  const field = pictureRebusBodyField(ctx, config, instruction)
  const boxes = pictureRebusRowBoxes(field, plan)

  const objects: StudioFabricObject[] = [...header.objects]
  puzzles.forEach((puzzle, index) => {
    const box = boxes[index]
    if (!box) return
    drawPictureRebusRow(objects, { puzzle, index, box, plan, font, tag })
  })

  return [{ pageRole: 'single', objects }]
}

export const pictureRebusTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Picture Rebus',
  category: 'word',
  description:
    'Two big pictures side by side make one word: a sun and a flower make SUNFLOWER. Every picture is drawn as clean black line art — no colour, no emoji — and the answer has a writing slot for each letter, so there is only ever one answer that fits. Pick a level; how many puzzles a page holds and how large the pictures print are fitted to your page. Includes a matching answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PICTURE_REBUS_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="13" r="4.4"/>
      <path d="M14 5.2v1.8M14 19v1.8M6.2 13h1.8M20 13h1.8M8.5 7.5l1.3 1.3M18.2 17.2l1.3 1.3M19.5 7.5l-1.3 1.3M9.8 17.2l-1.3 1.3"/>
      <circle cx="50" cy="10.6" r="3.2"/>
      <path d="M50 13.8v7.4M50 18.4c-2.6 0-4.6-2-4.6-4.4M50 16.6c2.4 0 4.3-1.8 4.3-4"/>
    </g>
    <text x="32" y="17" font-size="11" fill="currentColor" font-family="serif" text-anchor="middle">+</text>
    <g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
      <path d="M8 31h5M15 31h5M22 31h5M29 31h5M36 31h5M43 31h5M50 31h5"/>
    </g>
  </svg>`,
  configSchema: PICTURE_REBUS_CONFIG_SCHEMA,
  generate,
}
