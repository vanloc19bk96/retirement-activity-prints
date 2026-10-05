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
import { LAMP_CONFIG_SCHEMA } from './config'
import {
  LAMP_BUILD_FAILED_MESSAGE,
  LAMP_DEFAULT_TITLE,
  LAMP_HOMES,
  LAMP_TEMPLATE_KEY,
  lampHouseRng,
  lampInstruction,
  lampLevelSpec,
  lampPageLabel,
  lampPageTooSmallMessage,
  parseLampBook,
  parseLampLevel,
  pickLampHome,
} from './content'
import { buildLampPuzzle } from './draw'
import { checkLampDrawnPage, runLampKdpPreflight } from './kdp-preflight'
import { lampContentBox, lampPanelInBody, planLampPage } from './layout'
import { lamplighterPrefetch, parseLampRemoteData } from './prefetch'
import { buildLampHouse } from './puzzle'

/** One ledger for the template: a seller's next book opens at other homes. */
const VARIETY_KEY = studioVarietyKey(LAMP_TEMPLATE_KEY, 'homes')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(lampContentBox(ctx), config, tag, instruction)
  return {
    pageRole: 'single',
    buildFailed: message,
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
 * One Lamplighter page, and the answer page with every lamp lit.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the house prints, so the form's help line is what prints. The home's name
 * is dealt against what the book and this seller have already printed; the
 * walls and lamps are built fresh from the seller's salt and the page seed
 * and must pass the preflight (every rule kept, finished by the level's own
 * logic on exactly that answer and not by easier steps alone where the
 * level asks for more, large print, on the page, not a repeat) and the
 * drawn check (every wall and number on its square, a lamp on exactly
 * every square of the answer and nothing else added to the floor). A
 * house that fails anywhere is set aside and another built; if none passes,
 * the page says so plainly instead of printing a house a reader cannot
 * finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseLampLevel(config.level)
  const spec = lampLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = lampInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: LAMP_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(lampContentBox(ctx), config, tag, instruction)
  const panel = lampPanelInBody(header.body, header.objects.length > 0)
  const plan = planLampPage(panel, level, font)
  if (!plan) return fail(lampPageTooSmallMessage(spec))

  const book = parseLampBook(parseLampRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at homes their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, LAMP_HOMES.length - 6)
  const home = pickLampHome({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildLampHouse({ ...spec, rng: lampHouseRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runLampKdpPreflight({ built, plan, level, home, panel, font, book }).ok) continue

    const label = lampPageLabel(home, level, built.signature)
    const draw = () => buildLampPuzzle({ built, plan, home, level, label, tag, font })
    const puzzle = draw()
    if (checkLampDrawnPage({ puzzle, built, home }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [home.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every lamp is lit.
        answerSourceObjects: [...drawHeader(lampContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(LAMP_BUILD_FAILED_MESSAGE)
}

export const lamplighterTemplate: StudioTemplateDefinition = {
  key: LAMP_TEMPLATE_KEY,
  label: 'Lamplighter: Light the House',
  category: 'logic',
  description:
    'The classic Light Up (Akari) puzzle, moved into a retiree’s home: put lamps on the white squares until every square is lit. Each lamp shines along its row and column until a wall stops it, no lamp may shine on another, and a number on a wall says how many lamps touch it. Every house is built fresh, proven to have one answer reached by logic alone, and named for a retiree’s home, such as Lakeside Cabin, Grandma’s Farmhouse or Lighthouse Keeper’s House. Three levels, large print, and a clear answer page that shows every lamp on its square.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: LAMP_DEFAULT_TITLE,
  prefetch: lamplighterPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" opacity="0.2">
      <path d="M16 17.2h16v1.6H16zM29.2 4h1.6v16h-1.6zM20 25.2h28v1.6H20zM41.2 4h1.6v32h-1.6z"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.4">
      <path d="M20 4v32M24 4v32M28 4v32M32 4v32M36 4v32M40 4v32M44 4v32M16 8h32M16 12h32M16 16h32M16 20h32M16 24h32M16 28h32M16 32h32"/>
    </g>
    <g fill="currentColor">
      <path d="M24 4h4v4h-4zM44 12h4v4h-4zM28 20h4v4h-4zM32 16h4v4h-4zM16 24h4v4h-4zM36 32h4v4h-4z"/>
    </g>
    <g fill="#fff" font-family="sans-serif" font-size="3.4" font-weight="700" text-anchor="middle">
      <text x="34" y="19.2">1</text>
      <text x="46" y="15.2">0</text>
      <text x="30" y="23.2">1</text>
    </g>
    <g fill="#fff" stroke="currentColor" stroke-width="0.5">
      <circle cx="30" cy="17.4" r="1.5"/>
      <circle cx="42" cy="25.4" r="1.5"/>
    </g>
    <g fill="currentColor">
      <path d="M29.3 18.9h1.4v1h-1.4zM41.3 26.9h1.4v1h-1.4z"/>
    </g>
    <rect x="16" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  configSchema: LAMP_CONFIG_SCHEMA,
  generate,
}
