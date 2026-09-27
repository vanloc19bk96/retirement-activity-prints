import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { PEARL_CONFIG_SCHEMA } from './config'
import {
  PEARL_BUILD_FAILED_MESSAGE,
  PEARL_DEFAULT_TITLE,
  PEARL_NECKLACES,
  PEARL_TEMPLATE_KEY,
  parsePearlBook,
  parsePearlLevel,
  pearlBoardRng,
  pearlInstruction,
  pearlLevelSpec,
  pearlPageLabel,
  pearlPageTooSmallMessage,
  pickPearlNecklace,
} from './content'
import { buildPearlPuzzle } from './draw'
import { checkPearlDrawnPage, runPearlKdpPreflight } from './kdp-preflight'
import { pearlContentBox, pearlPanelInBody, planPearlPage } from './layout'
import { parsePearlRemoteData, stringOfPearlsPrefetch } from './prefetch'
import { buildPearlBoard } from './puzzle'

/** One ledger for the template: a seller's next book opens at other necklaces. */
const VARIETY_KEY = studioVarietyKey(PEARL_TEMPLATE_KEY, 'necklaces')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(pearlContentBox(ctx), config, tag, instruction)
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
 * One String of Pearls page, and the answer page with the necklace strung.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the board prints, so the form's help line is what prints. The necklace's
 * name is dealt against what the book and this seller have already
 * printed; the loop and its pearls are built fresh from the seller's salt
 * and the page seed and must pass the preflight (one loop keeping every
 * pearl's rule, finished by the level's own logic on exactly that necklace
 * and not by easier steps alone where the level asks for more, large
 * print, on the page, not a repeat) and the drawn check (every pearl in its
 * square and colour, the cord threading exactly the necklace, a bead on
 * every square between the pearls). A board that fails anywhere is set
 * aside and another built; if none passes, the page says so plainly instead
 * of printing a board a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parsePearlLevel(config.level)
  const spec = pearlLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = pearlInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: PEARL_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(pearlContentBox(ctx), config, tag, instruction)
  const panel = pearlPanelInBody(header.body, header.objects.length > 0)
  const plan = planPearlPage(panel, level, font)
  if (!plan) return fail(pearlPageTooSmallMessage(spec))

  const book = parsePearlBook(parsePearlRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at necklaces
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, PEARL_NECKLACES.length - 6)
  const necklace = pickPearlNecklace({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildPearlBoard({ ...spec, rng: pearlBoardRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runPearlKdpPreflight({ built, plan, level, necklace, panel, font, book }).ok) continue

    const label = pearlPageLabel(necklace, level, built.signature)
    const draw = () => buildPearlPuzzle({ built, plan, necklace, level, label, tag, font })
    const puzzle = draw()
    if (checkPearlDrawnPage({ puzzle, built, necklace }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [necklace.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the necklace is strung.
        answerSourceObjects: [...drawHeader(pearlContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(PEARL_BUILD_FAILED_MESSAGE)
}

export const stringOfPearlsTemplate: StudioTemplateDefinition = {
  key: PEARL_TEMPLATE_KEY,
  label: 'String of Pearls: Thread the Necklace',
  category: 'logic',
  description:
    'The classic Masyu puzzle, strung as a necklace from a retiree’s life: draw one loop through the squares that threads every pearl — straight through a white pearl with a turn beside it, a turn on a black pearl with a straight run each way. Every board is built fresh, proven to have one necklace reached by logic alone, and named for a necklace worth remembering — Golden Anniversary Pearls, Grandma’s Sunday Pearls, the Grandkids’ Macaroni Necklace. Three levels, large print, and an answer page where the loop becomes the necklace itself: a smooth cord through the pearls, a bead on every square between.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PEARL_DEFAULT_TITLE,
  prefetch: stringOfPearlsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.4" opacity="0.4">
      <path d="M24 4v32M32 4v32M40 4v32M16 12h32M16 20h32M16 28h32"/>
    </g>
    <path d="M20 8h8v8h8V8h8v24H20z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" opacity="0.45"/>
    <g fill="#fff" stroke="currentColor" stroke-width="0.9">
      <circle cx="44" cy="16" r="2.6"/>
      <circle cx="20" cy="16" r="2.6"/>
      <circle cx="36" cy="32" r="2.6"/>
    </g>
    <g fill="currentColor">
      <circle cx="20" cy="32" r="2.6"/>
      <circle cx="44" cy="32" r="2.6"/>
    </g>
    <g fill="none" stroke-width="0.6" stroke-linecap="round">
      <path d="M42.6 15.1a1.6 1.6 0 0 1 1.2-0.9M18.6 15.1a1.6 1.6 0 0 1 1.2-0.9M34.6 31.1a1.6 1.6 0 0 1 1.2-0.9" stroke="currentColor" opacity="0.5"/>
      <path d="M18.6 31.1a1.6 1.6 0 0 1 1.2-0.9M42.6 31.1a1.6 1.6 0 0 1 1.2-0.9" stroke="#fff"/>
    </g>
    <rect x="16" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  configSchema: PEARL_CONFIG_SCHEMA,
  generate,
}
