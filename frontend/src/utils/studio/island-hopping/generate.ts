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
import { IH_CONFIG_SCHEMA } from './config'
import {
  IH_BUILD_FAILED_MESSAGE,
  IH_CHAINS,
  IH_DEFAULT_TITLE,
  IH_TEMPLATE_KEY,
  ihChartRng,
  ihInstruction,
  ihLevelSpec,
  ihPageLabel,
  ihPageTooSmallMessage,
  parseIhBook,
  parseIhLevel,
  pickIhChain,
} from './content'
import { buildIhPuzzle } from './draw'
import { checkIhDrawnPage, runIhKdpPreflight } from './kdp-preflight'
import { ihContentBox, ihPanelInBody, planIhPage } from './layout'
import { islandHoppingPrefetch, parseIhRemoteData } from './prefetch'
import { buildIhChart } from './puzzle'

/** One ledger for the template: a seller's next book opens at other island chains. */
const VARIETY_KEY = studioVarietyKey(IH_TEMPLATE_KEY, 'chains')
/** Chart streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(ihContentBox(ctx), config, tag, instruction)
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
 * One Island Hopping page, and the answer page that builds every bridge.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * chart prints, so the form's help line is what prints. The island chain is
 * dealt against what the book and this seller have already printed; a chart
 * is built fresh from the seller's salt and the page seed and must pass the
 * preflight (numbers read off the answer, every rule kept, finished by the
 * level's own logic on exactly that answer and not by the level below's,
 * large print, on the page, not a repeat) and the drawn check (every island
 * at its point with its number, a hidden bridge on every answer lane). A
 * chart that fails anywhere is set aside and another built; if none passes,
 * the page says so plainly instead of printing a chart a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseIhLevel(config.level)
  const spec = ihLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = ihInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const tag: StudioTag = { templateKey: IH_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(ihContentBox(ctx), config, tag, instruction)
  const panel = ihPanelInBody(header.body, header.objects.length > 0)
  const plan = planIhPage(panel, level, font)
  if (!plan) return fail(ihPageTooSmallMessage(spec))

  const book = parseIhBook(parseIhRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of chains: a seller's next book opens at islands
  // their last one visited least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, IH_CHAINS.length - 6)
  const chain = pickIhChain({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildIhChart({ ...spec, rng: ihChartRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runIhKdpPreflight({ built, plan, level, chain, panel, font, book }).ok) continue

    const label = ihPageLabel(chain, level, built.signature)
    const draw = () => buildIhPuzzle({ built, plan, chain, level, label, tag, font })
    const puzzle = draw()
    if (checkIhDrawnPage({ puzzle, built, chain }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [chain.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every bridge is built.
        answerSourceObjects: [...drawHeader(ihContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(IH_BUILD_FAILED_MESSAGE)
}

export const islandHoppingTemplate: StudioTemplateDefinition = {
  key: IH_TEMPLATE_KEY,
  label: 'Island Hopping: Bridges',
  category: 'logic',
  description:
    'A retirement-cruise Bridges (Hashi) puzzle: join numbered islands with straight bridges — one or two between a pair, never crossing — until every island can be reached. Every chart is built fresh, proven to have one answer reached by logic alone, and set under the sign of a retirement island chain — Porch Swing Islands, Gone Fishin’ Islands, No Alarm Clock Islands. Three levels, large print, and an answer page with every bridge built.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: IH_DEFAULT_TITLE,
  prefetch: islandHoppingPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="2" width="40" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.5"/>
    <g fill="currentColor" opacity="0.45">
      <circle cx="27" cy="20" r="0.6"/><circle cx="34" cy="20" r="0.6"/><circle cx="27" cy="8" r="0.6"/><circle cx="34" cy="8" r="0.6"/>
      <circle cx="44" cy="32" r="0.6"/><circle cx="27" cy="32" r="0.6"/>
    </g>
    <g stroke="currentColor" stroke-width="0.9" stroke-linecap="round">
      <path d="M24 8h16"/>
      <path d="M19 12v16M21 12v16"/>
      <path d="M24 32h6"/>
      <path d="M44 12v4"/>
    </g>
    <g fill="#fff" stroke="currentColor" stroke-width="0.8">
      <circle cx="20" cy="8" r="4"/><circle cx="44" cy="8" r="4"/><circle cx="20" cy="32" r="4"/><circle cx="34" cy="32" r="4"/><circle cx="44" cy="20" r="4"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle">
      <text x="20" y="9.8">3</text><text x="44" y="9.8">2</text><text x="20" y="33.8">3</text><text x="34" y="33.8">1</text><text x="44" y="21.8">1</text>
    </g>
  </svg>`,
  configSchema: IH_CONFIG_SCHEMA,
  generate,
}
