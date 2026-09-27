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
import { GP_CONFIG_SCHEMA } from './config'
import {
  GP_BUILD_FAILED_MESSAGE,
  GP_DEFAULT_TITLE,
  GP_GARDENS,
  GP_TEMPLATE_KEY,
  gpGardenRng,
  gpInstruction,
  gpLevelSpec,
  gpPageLabel,
  gpPageTooSmallMessage,
  parseGpBook,
  parseGpLevel,
  pickGpGarden,
} from './content'
import { buildGpPuzzle } from './draw'
import { checkGpDrawnPage, runGpKdpPreflight } from './kdp-preflight'
import { gpContentBox, gpPanelInBody, planGpPage } from './layout'
import { gardenPlotsPrefetch, parseGpRemoteData } from './prefetch'
import { buildGpGarden } from './puzzle'

/** One ledger for the template: a seller's next book opens at other gardens. */
const VARIETY_KEY = studioVarietyKey(GP_TEMPLATE_KEY, 'gardens')
/** Garden streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(gpContentBox(ctx), config, tag, instruction)
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
 * One Garden Plots page, and the answer page with every flower planted.
 *
 * Planned, grown, proven, drawn, checked. The trim alone fixes how large the
 * garden prints, so the form's help line is what prints. The garden's name
 * is dealt against what the book and this seller have already printed; the
 * beds are grown fresh from the seller's salt and the page seed and must
 * pass the preflight (every bed one patch, every rule kept, finished by the
 * level's own logic on exactly that answer and not by the basic steps alone
 * where the level asks for more, large print, on the page, not a repeat)
 * and the drawn check (walls exactly where beds meet, a hidden flower on
 * every planted square). A garden that fails anywhere is set aside and
 * another grown; if none passes, the page says so plainly instead of
 * printing a garden a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseGpLevel(config.level)
  const spec = gpLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = gpInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: GP_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(gpContentBox(ctx), config, tag, instruction)
  const panel = gpPanelInBody(header.body, header.objects.length > 0)
  const plan = planGpPage(panel, level, font)
  if (!plan) return fail(gpPageTooSmallMessage(spec))

  const book = parseGpBook(parseGpRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of gardens: a seller's next book opens at gardens
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, GP_GARDENS.length - 6)
  const garden = pickGpGarden({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildGpGarden({ ...spec, rng: gpGardenRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runGpKdpPreflight({ built, plan, level, garden, panel, font, book }).ok) continue

    const label = gpPageLabel(garden, level, built.signature)
    const draw = () => buildGpPuzzle({ built, plan, garden, level, label, tag, font })
    const puzzle = draw()
    if (checkGpDrawnPage({ puzzle, built, garden }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [garden.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every flower is planted.
        answerSourceObjects: [...drawHeader(gpContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(GP_BUILD_FAILED_MESSAGE)
}

export const gardenPlotsTemplate: StudioTemplateDefinition = {
  key: GP_TEMPLATE_KEY,
  label: 'Garden Plots: Plant the Flowers',
  category: 'logic',
  description:
    'The viral Queens puzzle, replanted for retirement: a garden split into flower beds, with one flower to plant in every row, every column and every bed, and no two flowers touching, not even corner to corner. Every garden is grown fresh, proven to have one answer reached by logic alone, and signed with a retiree’s garden: Sunny Porch Garden, Lavender Lane, Kitchen Herb Garden. Three levels, large print, soft gray beds in heavy walls, and an answer page in full bloom.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: GP_DEFAULT_TITLE,
  prefetch: gardenPlotsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="none" fill="currentColor">
      <path opacity="0.14" d="M16 4h16v8h-8v8h-8z"/>
      <path opacity="0.28" d="M32 4h16v16h-8v-8h-8z"/>
      <path opacity="0.2" d="M16 20h8v16h-8z"/>
      <path opacity="0.06" d="M24 12h16v8h8v16H24z"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.45">
      <path d="M24 4v32M32 4v32M40 4v32M16 12h32M16 20h32M16 28h32"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
      <rect x="16" y="4" width="32" height="32"/>
      <path d="M32 4v8h-8v8h-8M24 20v16M40 12v8h8M24 12h16"/>
    </g>
    <g stroke="currentColor" stroke-width="0.5">
      <g fill="#fff"><circle cx="28" cy="6.6" r="1.4"/><circle cx="30.2" cy="8.2" r="1.4"/><circle cx="29.4" cy="10.6" r="1.4"/><circle cx="26.6" cy="10.6" r="1.4"/><circle cx="25.8" cy="8.2" r="1.4"/></g>
      <circle cx="28" cy="8.6" r="1" fill="currentColor"/>
      <g fill="#fff"><circle cx="44" cy="14.6" r="1.4"/><circle cx="46.2" cy="16.2" r="1.4"/><circle cx="45.4" cy="18.6" r="1.4"/><circle cx="42.6" cy="18.6" r="1.4"/><circle cx="41.8" cy="16.2" r="1.4"/></g>
      <circle cx="44" cy="16.6" r="1" fill="currentColor"/>
      <g fill="#fff"><circle cx="20" cy="22.6" r="1.4"/><circle cx="22.2" cy="24.2" r="1.4"/><circle cx="21.4" cy="26.6" r="1.4"/><circle cx="18.6" cy="26.6" r="1.4"/><circle cx="17.8" cy="24.2" r="1.4"/></g>
      <circle cx="20" cy="24.6" r="1" fill="currentColor"/>
      <g fill="#fff"><circle cx="36" cy="30.6" r="1.4"/><circle cx="38.2" cy="32.2" r="1.4"/><circle cx="37.4" cy="34.6" r="1.4"/><circle cx="34.6" cy="34.6" r="1.4"/><circle cx="33.8" cy="32.2" r="1.4"/></g>
      <circle cx="36" cy="32.6" r="1" fill="currentColor"/>
    </g>
  </svg>`,
  configSchema: GP_CONFIG_SCHEMA,
  generate,
}
