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
import { SKY_CONFIG_SCHEMA } from './config'
import {
  SKY_BUILD_FAILED_MESSAGE,
  SKY_CITIES,
  SKY_DEFAULT_TITLE,
  SKY_TEMPLATE_KEY,
  parseSkyBook,
  parseSkyLevel,
  pickSkyCity,
  skyCityRng,
  skyInstruction,
  skyLevelSpec,
  skyPageLabel,
  skyPageTooSmallMessage,
} from './content'
import { buildSkyPuzzle } from './draw'
import { checkSkyDrawnPage, runSkyKdpPreflight } from './kdp-preflight'
import { planSkyPage, skyContentBox, skyPanelInBody } from './layout'
import { parseSkyRemoteData, skylineTourPrefetch } from './prefetch'
import { buildSkyCity } from './puzzle'

/** One ledger for the template: a seller's next book opens at other skylines. */
const VARIETY_KEY = studioVarietyKey(SKY_TEMPLATE_KEY, 'cities')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(skyContentBox(ctx), config, tag, instruction)
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
 * One Skyline Tour page, and the answer page with every height filled in.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the city prints, so the form's help line is what prints. The skyline's
 * name is dealt against what the book and this seller have already
 * printed; the heights and clues are built fresh from the seller's salt
 * and the page seed and must pass the preflight (every height once in
 * every row and column, every clue kept, finished by the level's own logic
 * on exactly that answer and not by easier steps alone where the level
 * asks for more, large print, on the page, not a repeat) and the drawn
 * check (every clue and given plot in place, the answer's height hidden
 * on every other plot, the same drawing the answer page reveals). A
 * city that fails anywhere is set aside and another built; if none passes,
 * the page says so plainly instead of printing a city a reader cannot
 * finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseSkyLevel(config.level)
  const spec = skyLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = skyInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: SKY_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(skyContentBox(ctx), config, tag, instruction)
  const panel = skyPanelInBody(header.body, header.objects.length > 0)
  const plan = planSkyPage(panel, level, font)
  if (!plan) return fail(skyPageTooSmallMessage(spec))

  const book = parseSkyBook(parseSkyRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at skylines
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, SKY_CITIES.length - 6)
  const city = pickSkyCity({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildSkyCity({ ...spec, rng: skyCityRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runSkyKdpPreflight({ built, plan, level, city, panel, font, book }).ok) continue

    const label = skyPageLabel(city, level, built.signature)
    const draw = () => buildSkyPuzzle({ built, plan, city, level, label, tag, font })
    const puzzle = draw()
    if (checkSkyDrawnPage({ puzzle, built, city }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [city.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every open plot shows its height.
        answerSourceObjects: [...drawHeader(skyContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(SKY_BUILD_FAILED_MESSAGE)
}

export const skylineTourTemplate: StudioTemplateDefinition = {
  key: SKY_TEMPLATE_KEY,
  label: 'Skyline Tour: Raise the Towers',
  category: 'logic',
  description:
    'The classic Skyscrapers puzzle, set in the skylines of a retiree’s travels: fill the city with buildings so every row and column holds each height once, and a number outside says how many buildings you see from there, the taller hiding the shorter behind. Every city is built fresh, proven to have one answer reached by logic alone, and named for a skyline worth touring, such as Chicago Lakefront, Paris Left Bank, Sydney Harbour, the Hometown Main Street. Three levels, large print, and an answer page that fills in every height in clear, large digits.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: SKY_DEFAULT_TITLE,
  prefetch: skylineTourPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.4" opacity="0.4">
      <path d="M26 8v24M32 8v24M38 8v24M20 14h24M20 20h24M20 26h24"/>
    </g>
    <g fill="currentColor" opacity="0.3">
      <path d="M21.5 13.4h3v-3h-3zM27.5 13.4h3v-4.6h-3zM33.5 13.4h3v-2.2h-3zM39.5 13.4h3v-3.8h-3z"/>
      <path d="M21.5 19.4h3v-4.6h-3zM27.5 19.4h3v-2.2h-3zM33.5 19.4h3v-3.8h-3zM39.5 19.4h3v-3h-3z"/>
      <path d="M21.5 25.4h3v-2.2h-3zM27.5 25.4h3v-3.8h-3zM33.5 25.4h3v-3h-3zM39.5 25.4h3v-4.6h-3z"/>
      <path d="M21.5 31.4h3v-3.8h-3zM27.5 31.4h3v-3h-3zM33.5 31.4h3v-4.6h-3zM39.5 31.4h3v-2.2h-3z"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4" font-weight="700" text-anchor="middle">
      <text x="29" y="6.4">1</text>
      <text x="41" y="6.4">2</text>
      <text x="17" y="24.6">3</text>
      <text x="47" y="12.6">2</text>
      <text x="23" y="37.2">2</text>
      <text x="35" y="37.2">1</text>
    </g>
    <rect x="20" y="8" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  configSchema: SKY_CONFIG_SCHEMA,
  generate,
}
