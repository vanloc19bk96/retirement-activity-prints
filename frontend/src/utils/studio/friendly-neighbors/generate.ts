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
import { NEIGHBORS_CONFIG_SCHEMA } from './config'
import {
  NEIGHBORS_BUILD_FAILED_MESSAGE,
  NEIGHBORS_DEFAULT_TITLE,
  NEIGHBORS_STREETS,
  NEIGHBORS_TEMPLATE_KEY,
  neighborsInstruction,
  neighborsLevelSpec,
  neighborsPageLabel,
  neighborsPageTooSmallMessage,
  neighborsTownRng,
  parseNeighborsBook,
  parseNeighborsLevel,
  pickNeighborsStreet,
} from './content'
import { buildNeighborsPuzzle } from './draw'
import { checkNeighborsDrawnPage, runNeighborsKdpPreflight } from './kdp-preflight'
import { neighborsContentBox, neighborsPanelInBody, planNeighborsPage } from './layout'
import { friendlyNeighborsPrefetch, parseNeighborsRemoteData } from './prefetch'
import { buildNeighborsTown } from './puzzle'

/** One ledger for the template: a seller's next book opens at other streets. */
const VARIETY_KEY = studioVarietyKey(NEIGHBORS_TEMPLATE_KEY, 'streets')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(neighborsContentBox(ctx), config, tag, instruction)
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
 * One Friendly Neighbors page, and the answer page with the streets paved.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the houses print, so the form's help line is what prints. The street's
 * name is dealt against what the book and this seller have already printed;
 * the town, its blocks and its numbers are built fresh from the seller's
 * salt and the page seed and must pass the preflight (blocks of one to five
 * houses, mostly fours and fives; one answer numbering every block with no
 * touching houses alike; finished by the level's own logic on exactly that
 * answer and not by easier steps alone where the level asks for more; large
 * print; on the page; not a repeat) and the drawn check (every block and
 * printed number in place, every other number waiting in its own house, the
 * streets ready to pave). A town that fails anywhere is set aside and
 * another built; if none passes, the page says so plainly instead of
 * printing a town a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseNeighborsLevel(config.level)
  const spec = neighborsLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = neighborsInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: NEIGHBORS_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(neighborsContentBox(ctx), config, tag, instruction)
  const panel = neighborsPanelInBody(header.body, header.objects.length > 0)
  const plan = planNeighborsPage(panel, level, font)
  if (!plan) return fail(neighborsPageTooSmallMessage(spec))

  const book = parseNeighborsBook(parseNeighborsRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at streets their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, NEIGHBORS_STREETS.length - 6)
  const street = pickNeighborsStreet({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildNeighborsTown({ ...spec, rng: neighborsTownRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runNeighborsKdpPreflight({ built, plan, level, street, panel, font, book }).ok) continue

    const label = neighborsPageLabel(street, level, built.signature)
    const draw = () => buildNeighborsPuzzle({ built, plan, street, level, label, tag, font })
    const puzzle = draw()
    if (checkNeighborsDrawnPage({ puzzle, built, street }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [street.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the streets are paved.
        answerSourceObjects: [...drawHeader(neighborsContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(NEIGHBORS_BUILD_FAILED_MESSAGE)
}

export const friendlyNeighborsTemplate: StudioTemplateDefinition = {
  key: NEIGHBORS_TEMPLATE_KEY,
  label: 'Friendly Neighbors: Number the Houses',
  category: 'logic',
  description:
    'The number-block puzzle Europe’s puzzle lovers adore (Suguru), laid out as a retiree’s dream street: blocks of one to five houses sit between the streets, and every block holds 1 up to its number of houses, while touching houses (even corner to corner or across the street) never share a number. Every town is built fresh, proven to have one answer reached by logic alone, and named for a street worth moving to: Maple Lane, Harbor View Cottages, the Grandkids’ Cul-de-Sac. Three levels, large print, and an answer page where the town becomes a map with its streets paved.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: NEIGHBORS_DEFAULT_TITLE,
  prefetch: friendlyNeighborsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="60" height="36" fill="currentColor" opacity="0.12"/>
    <path d="M3.2 34.8L3.2 5.2Q3.2 3.2 5.2 3.2L22.8 3.2Q24.8 3.2 24.8 5.2L24.8 10.8Q24.8 12.8 22.8 12.8L14 12.8Q12.8 12.8 12.8 14L12.8 34.8Q12.8 36.8 10.8 36.8L5.2 36.8Q3.2 36.8 3.2 34.8Z M27.2 10.8L27.2 5.2Q27.2 3.2 29.2 3.2L58.8 3.2Q60.8 3.2 60.8 5.2L60.8 10.8Q60.8 12.8 58.8 12.8L50 12.8Q48.8 12.8 48.8 14L48.8 22.8Q48.8 24.8 46.8 24.8L41.2 24.8Q39.2 24.8 39.2 22.8L39.2 14Q39.2 12.8 38 12.8L29.2 12.8Q27.2 12.8 27.2 10.8Z M15.2 34.8L15.2 17.2Q15.2 15.2 17.2 15.2L34.8 15.2Q36.8 15.2 36.8 17.2L36.8 34.8Q36.8 36.8 34.8 36.8L17.2 36.8Q15.2 36.8 15.2 34.8Z M51.2 26L51.2 17.2Q51.2 15.2 53.2 15.2L58.8 15.2Q60.8 15.2 60.8 17.2L60.8 34.8Q60.8 36.8 58.8 36.8L41.2 36.8Q39.2 36.8 39.2 34.8L39.2 29.2Q39.2 27.2 41.2 27.2L50 27.2Q51.2 27.2 51.2 26Z" fill="white" stroke="currentColor" stroke-width="1" opacity="0.9"/>
    <path d="M14 3.2L14 12.8M3.2 14L12.8 14M38 3.2L38 12.8M50 3.2L50 12.8M39.2 14L48.8 14M3.2 26L12.8 26M26 15.2L26 26M15.2 26L26 26M26 26L36.8 26M51.2 26L60.8 26M26 26L26 36.8M50 27.2L50 36.8" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.5"/>
    <g fill="currentColor" font-family="sans-serif" font-size="6" font-weight="700" text-anchor="middle">
      <text x="8" y="10.2">3</text>
      <text x="56" y="10.2">2</text>
      <text x="32" y="22.2">4</text>
      <text x="8" y="34.2">1</text>
      <text x="56" y="34.2">3</text>
    </g>
  </svg>`,
  configSchema: NEIGHBORS_CONFIG_SCHEMA,
  generate,
}
