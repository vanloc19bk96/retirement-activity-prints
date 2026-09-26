import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { HC_CONFIG_SCHEMA } from './config'
import {
  HC_BUILD_FAILED_MESSAGE,
  HC_CAMPGROUNDS,
  HC_DEFAULT_TITLE,
  HC_TEMPLATE_KEY,
  hcGridRng,
  hcInstruction,
  hcLevelSpec,
  hcPageLabel,
  hcPageTooSmallMessage,
  parseHcBook,
  parseHcLevel,
  pickHcCampground,
} from './content'
import { buildHcPuzzle } from './draw'
import { checkHcDrawnPage, runHcKdpPreflight } from './kdp-preflight'
import { hcContentBox, hcPanelInBody, planHcPage } from './layout'
import { happyCampersPrefetch, parseHcRemoteData } from './prefetch'
import { buildHcGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other campgrounds. */
const VARIETY_KEY = studioVarietyKey(HC_TEMPLATE_KEY, 'campgrounds')
/** Grid streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(hcContentBox(ctx), config, tag, instruction)
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
 * One Happy Campers page, and the answer page that pitches every tent.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * grid prints, so the form's help line is what prints. The campground is
 * dealt against what the book and this seller have already printed; a grid
 * is built fresh from the seller's salt and the page seed and must pass the
 * preflight (numbers read off the answer, every rule kept, finished by the
 * level's own logic on exactly that answer, large print, on the page, not a
 * repeat) and the drawn check (every number in its line, a tree on every tree
 * square, a hidden tent on every answer square). A grid that fails anywhere
 * is set aside and another built; if none passes, the page says so plainly
 * instead of printing a campground a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseHcLevel(config.level)
  const spec = hcLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = hcInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const tag: StudioTag = { templateKey: HC_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(hcContentBox(ctx), config, tag, instruction)
  const panel = hcPanelInBody(header.body, header.objects.length > 0)
  const plan = planHcPage(panel, level, font)
  if (!plan) return fail(hcPageTooSmallMessage(spec))

  const book = parseHcBook(parseHcRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at campgrounds
  // their last one visited least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, HC_CAMPGROUNDS.length - 6)
  const campground = pickHcCampground({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildHcGrid({ ...spec, rng: hcGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runHcKdpPreflight({ built, plan, level, campground, panel, font, book }).ok) continue

    const label = hcPageLabel(campground, level, built.signature)
    const draw = () => buildHcPuzzle({ built, plan, campground, level, label, tag, font })
    const puzzle = draw()
    if (checkHcDrawnPage({ puzzle, built, campground }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [campground.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every tent is pitched.
        answerSourceObjects: [...drawHeader(hcContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(HC_BUILD_FAILED_MESSAGE)
}

export const happyCampersTemplate: StudioTemplateDefinition = {
  key: HC_TEMPLATE_KEY,
  label: 'Happy Campers: Tents & Trees',
  category: 'logic',
  description:
    'A retirement road-trip logic puzzle: pitch one tent beside every tree so no two tents touch, and match the numbers on each row and column. Every grid is built fresh, proven to have one answer reached by logic alone, and set under the sign of a retirement campground — Rocking Chair Ridge, Gone Fishin’ Cove, No Alarm Clock Acres. Three levels, large print, and an answer page with every tent pitched.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: HC_DEFAULT_TITLE,
  prefetch: happyCampersPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" font-family="sans-serif" font-size="3.4" font-weight="700" text-anchor="middle">
      <text x="26" y="8">1</text><text x="30" y="8">2</text><text x="34" y="8">0</text><text x="38" y="8">2</text><text x="42" y="8">0</text>
      <text x="21" y="13.2">1</text><text x="21" y="17.2">1</text><text x="21" y="21.2">1</text><text x="21" y="25.2">1</text><text x="21" y="29.2">1</text>
    </g>
    <g fill="none" stroke="currentColor">
      <path d="M28 10v20M32 10v20M36 10v20M40 10v20M24 14h20M24 18h20M24 22h20M24 26h20" stroke-width="0.3" opacity="0.6"/>
      <rect x="24" y="10" width="20" height="20" stroke-width="1"/>
    </g>
    <g fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="0.4" stroke-linejoin="round">
      <path d="M26 10.5l1.5 2.4h-0.8l1.1 1.8h-3.6l1.1-1.8h-0.8z"/>
      <path d="M38 10.5l1.5 2.4h-0.8l1.1 1.8h-3.6l1.1-1.8h-0.8z"/>
      <path d="M26 22.5l1.5 2.4h-0.8l1.1 1.8h-3.6l1.1-1.8h-0.8z"/>
      <path d="M42 22.5l1.5 2.4h-0.8l1.1 1.8h-3.6l1.1-1.8h-0.8z"/>
      <path d="M34 26.5l1.5 2.4h-0.8l1.1 1.8h-3.6l1.1-1.8h-0.8z"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round">
      <path d="M28.3 13.6l1.7-3 1.7 3zM29.4 13.6l0.6-1.3 0.6 1.3"/>
      <path d="M36.3 17.6l1.7-3 1.7 3zM37.4 17.6l0.6-1.3 0.6 1.3"/>
      <path d="M24.3 21.6l1.7-3 1.7 3zM25.4 21.6l0.6-1.3 0.6 1.3"/>
      <path d="M36.3 25.6l1.7-3 1.7 3zM37.4 25.6l0.6-1.3 0.6 1.3"/>
      <path d="M28.3 29.6l1.7-3 1.7 3zM29.4 29.6l0.6-1.3 0.6 1.3"/>
    </g>
  </svg>`,
  configSchema: HC_CONFIG_SCHEMA,
  generate,
}
