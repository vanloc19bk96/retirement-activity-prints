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
import { FENCE_CONFIG_SCHEMA } from './config'
import {
  FENCE_BUILD_FAILED_MESSAGE,
  FENCE_DEFAULT_TITLE,
  FENCE_PASTURES,
  FENCE_TEMPLATE_KEY,
  fenceFieldRng,
  fenceInstruction,
  fenceLevelSpec,
  fencePageLabel,
  fencePageTooSmallMessage,
  parseFenceBook,
  parseFenceLevel,
  pickFencePasture,
} from './content'
import { buildFencePuzzle } from './draw'
import { checkFenceDrawnPage, runFenceKdpPreflight } from './kdp-preflight'
import { fenceContentBox, fencePanelInBody, planFencePage } from './layout'
import { countryFencePrefetch, parseFenceRemoteData } from './prefetch'
import { buildFenceField } from './puzzle'

/** One ledger for the template: a seller's next book opens at other pastures. */
const VARIETY_KEY = studioVarietyKey(FENCE_TEMPLATE_KEY, 'pastures')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(fenceContentBox(ctx), config, tag, instruction)
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
 * One Country Fence page, and the answer page with the pasture fenced.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the field prints, so the form's help line is what prints. The pasture's
 * name is dealt against what the book and this seller have already
 * printed; the fence and its numbers are built fresh from the seller's salt
 * and the page seed and must pass the preflight (one loop giving every
 * number its count, finished by the level's own logic on exactly that fence
 * and not by easier steps alone where the level asks for more, large print,
 * on the page, not a repeat) and the drawn check (every post and number in
 * place, the fence running exactly the answer's rails, a post wherever it
 * passes, the pasture washed inside it). A field that fails
 * anywhere is set aside and another built; if none passes, the page says so
 * plainly instead of printing a field a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseFenceLevel(config.level)
  const spec = fenceLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = fenceInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: FENCE_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(fenceContentBox(ctx), config, tag, instruction)
  const panel = fencePanelInBody(header.body, header.objects.length > 0)
  const plan = planFencePage(panel, level, font)
  if (!plan) return fail(fencePageTooSmallMessage(spec))

  const book = parseFenceBook(parseFenceRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at pastures
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, FENCE_PASTURES.length - 6)
  const pasture = pickFencePasture({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildFenceField({ ...spec, rng: fenceFieldRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runFenceKdpPreflight({ built, plan, level, pasture, panel, font, book }).ok) continue

    const label = fencePageLabel(pasture, level, built.signature)
    const draw = () => buildFencePuzzle({ built, plan, pasture, level, label, tag, font })
    const puzzle = draw()
    if (checkFenceDrawnPage({ puzzle, built, pasture }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [pasture.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the pasture is fenced.
        answerSourceObjects: [...drawHeader(fenceContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(FENCE_BUILD_FAILED_MESSAGE)
}

export const countryFenceTemplate: StudioTemplateDefinition = {
  key: FENCE_TEMPLATE_KEY,
  label: 'Country Fence: Fence the Pasture',
  category: 'logic',
  description:
    'The classic Slitherlink puzzle, moved out to a retiree’s hobby farm: join the dots into one closed fence that never crosses or branches, while every number tells how many of its square’s sides are fence. Every field is built fresh, proven to have one fence reached by logic alone, and named for a pasture worth fencing, such as Sunny Acres Pasture, Grandpa’s Back Forty or the Grandkids’ Petting Zoo. Three levels, large print, and an answer page where the loop becomes the farm itself: a gray pasture inside a heavy fence, a post at every corner.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: FENCE_DEFAULT_TITLE,
  prefetch: countryFencePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 4H32V20H48V36H40V28H24V12H16Z" fill="currentColor" opacity="0.15"/>
    <path d="M16 4H32V20H48V36H40V28H24V12H16Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter" opacity="0.5"/>
    <g fill="currentColor">
      <circle cx="16" cy="4" r="0.9"/><circle cx="24" cy="4" r="0.9"/><circle cx="32" cy="4" r="0.9"/><circle cx="40" cy="4" r="0.9"/><circle cx="48" cy="4" r="0.9"/>
      <circle cx="16" cy="12" r="0.9"/><circle cx="24" cy="12" r="0.9"/><circle cx="32" cy="12" r="0.9"/><circle cx="40" cy="12" r="0.9"/><circle cx="48" cy="12" r="0.9"/>
      <circle cx="16" cy="20" r="0.9"/><circle cx="24" cy="20" r="0.9"/><circle cx="32" cy="20" r="0.9"/><circle cx="40" cy="20" r="0.9"/><circle cx="48" cy="20" r="0.9"/>
      <circle cx="16" cy="28" r="0.9"/><circle cx="24" cy="28" r="0.9"/><circle cx="32" cy="28" r="0.9"/><circle cx="40" cy="28" r="0.9"/><circle cx="48" cy="28" r="0.9"/>
      <circle cx="16" cy="36" r="0.9"/><circle cx="24" cy="36" r="0.9"/><circle cx="32" cy="36" r="0.9"/><circle cx="40" cy="36" r="0.9"/><circle cx="48" cy="36" r="0.9"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4.4" font-weight="700" text-anchor="middle">
      <text x="20" y="9.6">3</text>
      <text x="44" y="9.6">0</text>
      <text x="36" y="17.6">2</text>
      <text x="20" y="33.6">0</text>
      <text x="44" y="33.6">3</text>
    </g>
  </svg>`,
  configSchema: FENCE_CONFIG_SCHEMA,
  generate,
}
