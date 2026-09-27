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
import { CF_CONFIG_SCHEMA } from './config'
import {
  CF_BUILD_FAILED_MESSAGE,
  CF_DEFAULT_TITLE,
  CF_HARBORS,
  CF_TEMPLATE_KEY,
  cfHarborRng,
  cfInstruction,
  cfLevelSpec,
  cfPageLabel,
  cfPageTooSmallMessage,
  parseCfBook,
  parseCfLevel,
  pickCfHarbor,
} from './content'
import { buildCfPuzzle } from './draw'
import { checkCfDrawnPage, runCfKdpPreflight } from './kdp-preflight'
import { cfContentBox, cfPanelInBody, planCfPage } from './layout'
import { cruiseFleetPrefetch, parseCfRemoteData } from './prefetch'
import { buildCfHarbor } from './puzzle'

/** One ledger for the template: a seller's next book opens at other harbors. */
const VARIETY_KEY = studioVarietyKey(CF_TEMPLATE_KEY, 'harbors')
/** Fleet streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(cfContentBox(ctx), config, tag, instruction)
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
 * One Cruise Fleet page, and the answer page with the whole fleet in.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * harbor prints, so the form's help line is what prints. The harbor's name
 * is dealt against what the book and this seller have already printed; the
 * fleet is hidden fresh from the seller's salt and the page seed and must
 * pass the preflight (the level's fleet, every rule kept, finished by the
 * level's own logic on exactly that answer and not by the basic steps alone
 * where the level asks for more, large print, on the page, not a repeat)
 * and the drawn check (every number right, every shown square its piece, a
 * hidden ship on every ship square). A harbor that fails anywhere is set
 * aside and another built; if none passes, the page says so plainly instead
 * of printing a harbor a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseCfLevel(config.level)
  const spec = cfLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = cfInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: CF_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(cfContentBox(ctx), config, tag, instruction)
  const panel = cfPanelInBody(header.body, header.objects.length > 0)
  const plan = planCfPage(panel, level, font)
  if (!plan) return fail(cfPageTooSmallMessage(spec))

  const book = parseCfBook(parseCfRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of harbors: a seller's next book opens at harbors
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, CF_HARBORS.length - 6)
  const harbor = pickCfHarbor({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildCfHarbor({ ...spec, rng: cfHarborRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runCfKdpPreflight({ built, plan, level, harbor, panel, font, book }).ok) continue

    const label = cfPageLabel(harbor, level, built.signature)
    const draw = () => buildCfPuzzle({ built, plan, harbor, level, label, tag, font })
    const puzzle = draw()
    if (checkCfDrawnPage({ puzzle, built, harbor, plan }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [harbor.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the whole fleet sails in.
        answerSourceObjects: [...drawHeader(cfContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(CF_BUILD_FAILED_MESSAGE)
}

export const cruiseFleetTemplate: StudioTemplateDefinition = {
  key: CF_TEMPLATE_KEY,
  label: 'Cruise Fleet: Find the Ships',
  category: 'logic',
  description:
    'The classic Battleships puzzle, set sail for retirement: a harbor hides a cruise fleet (a cruise ship, ferries, sailboats and rowboats), and the numbers beside each row and column tell how many ship squares lie there. Ships never touch, not even corner to corner. Every harbor is built fresh, proven to have one answer reached by logic alone, and signed with a retiree’s port of call, such as Sunset Harbor, Lighthouse Point or Calm Seas Marina. Three levels, large print, the whole fleet drawn to scale in the legend, and an answer page where every ship sails in.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: CF_DEFAULT_TITLE,
  prefetch: cruiseFleetPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" font-family="sans-serif" font-size="3.4" font-weight="700" text-anchor="middle">
      <text x="24.5" y="6.4">2</text><text x="29.5" y="6.4">1</text><text x="34.5" y="6.4">2</text><text x="39.5" y="6.4">2</text><text x="44.5" y="6.4">0</text><text x="49.5" y="6.4">3</text>
      <text x="19" y="11.7">4</text><text x="19" y="16.7">1</text><text x="19" y="21.7">2</text><text x="19" y="26.7">0</text><text x="19" y="31.7">2</text><text x="19" y="36.7">1</text>
    </g>
    <g fill="none" stroke="currentColor">
      <path d="M27 8v30M32 8v30M37 8v30M42 8v30M47 8v30M22 13h30M22 18h30M22 23h30M22 28h30M22 33h30" stroke-width="0.3" opacity="0.6"/>
      <rect x="22" y="8" width="30" height="30" stroke-width="1.2"/>
      <path d="M43 25.2q1 -0.9 2 0t2 0M43 26.8q1 -0.9 2 0t2 0" stroke-width="0.5"/>
    </g>
    <g fill="currentColor">
      <rect x="22.75" y="8.75" width="13.5" height="3.5" rx="1.75"/>
      <rect x="47.75" y="8.75" width="3.5" height="8.5" rx="1.75"/>
      <rect x="32.75" y="18.75" width="8.5" height="3.5" rx="1.75"/>
      <circle cx="24.5" cy="30.5" r="1.75"/><circle cx="39.5" cy="30.5" r="1.75"/><circle cx="49.5" cy="35.5" r="1.75"/>
    </g>
    <g fill="#fff">
      <circle cx="24.5" cy="10.5" r="0.6"/><circle cx="29.5" cy="10.5" r="0.6"/><circle cx="34.5" cy="10.5" r="0.6"/>
      <circle cx="49.5" cy="10.5" r="0.6"/><circle cx="49.5" cy="15.5" r="0.6"/>
      <circle cx="34.5" cy="20.5" r="0.6"/><circle cx="39.5" cy="20.5" r="0.6"/>
    </g>
  </svg>`,
  configSchema: CF_CONFIG_SCHEMA,
  generate,
}
