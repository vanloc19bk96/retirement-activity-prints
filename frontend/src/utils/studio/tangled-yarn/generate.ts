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
import { TY_CONFIG_SCHEMA } from './config'
import {
  TY_BUILD_FAILED_MESSAGE,
  TY_DEFAULT_TITLE,
  TY_PROJECTS,
  TY_TEMPLATE_KEY,
  parseTyBook,
  parseTyLevel,
  pickTyProject,
  tyGridRng,
  tyInstruction,
  tyLevelSpec,
  tyPageLabel,
  tyPageTooSmallMessage,
} from './content'
import { buildTyPuzzle } from './draw'
import { checkTyDrawnPage, runTyKdpPreflight } from './kdp-preflight'
import { planTyPage, tyContentBox, tyPanelInBody } from './layout'
import { parseTyRemoteData, tangledYarnPrefetch } from './prefetch'
import { buildTyGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other projects. */
const VARIETY_KEY = studioVarietyKey(TY_TEMPLATE_KEY, 'projects')
/** Grid streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(tyContentBox(ctx), config, tag, instruction)
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
 * One Tangled Yarn page, and the answer page that draws every strand.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * grid prints, so the form's help line is what prints. The project is dealt
 * against what the book and this seller have already printed; a grid is
 * built fresh from the seller's salt and the page seed and must pass the
 * preflight (balls read off the answer, every rule kept, finished by the
 * level's own logic on exactly that answer and not by the level below's,
 * large print, on the page, not a repeat) and the drawn check (every ball in
 * its square with its letter, a hidden strand on every pair's squares). A
 * grid that fails anywhere is set aside and another built; if none passes,
 * the page says so plainly instead of printing a grid a reader cannot
 * finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseTyLevel(config.level)
  const spec = tyLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = tyInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const tag: StudioTag = { templateKey: TY_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(tyContentBox(ctx), config, tag, instruction)
  const panel = tyPanelInBody(header.body, header.objects.length > 0)
  const plan = planTyPage(panel, level, font)
  if (!plan) return fail(tyPageTooSmallMessage(spec))

  const book = parseTyBook(parseTyRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of projects: a seller's next book opens at projects
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, TY_PROJECTS.length - 6)
  const project = pickTyProject({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildTyGrid({ ...spec, rng: tyGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runTyKdpPreflight({ built, plan, level, project, panel, font, book }).ok) continue

    const label = tyPageLabel(project, level, built.signature)
    const draw = () => buildTyPuzzle({ built, plan, project, level, label, tag, font })
    const puzzle = draw()
    if (checkTyDrawnPage({ puzzle, built, project }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [project.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every strand is drawn.
        answerSourceObjects: [...drawHeader(tyContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(TY_BUILD_FAILED_MESSAGE)
}

export const tangledYarnTemplate: StudioTemplateDefinition = {
  key: TY_TEMPLATE_KEY,
  label: 'Tangled Yarn: Link the Pairs',
  category: 'logic',
  description:
    'A cozy knitting-basket Numberlink puzzle for retirement: join each pair of matching yarn balls with one strand, square to square, never crossing, until every square is filled. Every grid is built fresh, proven to have one answer reached by logic alone, and tagged with a retiree’s knitting project: Sunday Morning Scarf, Rocking Chair Afghan, Snow Day Mittens. Three levels, large print, and an answer page with every strand drawn.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: TY_DEFAULT_TITLE,
  prefetch: tangledYarnPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.4" opacity="0.45">
      <path d="M24 4v32M32 4v32M40 4v32M16 12h32M16 20h32M16 28h32"/>
    </g>
    <rect x="16" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">
      <path d="M20 8h24"/>
      <path d="M20 16v16h24"/>
      <path d="M28 16h16v8H28"/>
    </g>
    <g fill="#fff" stroke="currentColor" stroke-width="0.7">
      <circle cx="20" cy="8" r="3.2"/><circle cx="44" cy="8" r="3.2"/><circle cx="20" cy="16" r="3.2"/><circle cx="44" cy="32" r="3.2"/><circle cx="28" cy="16" r="3.2"/><circle cx="28" cy="24" r="3.2"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4" font-weight="700" text-anchor="middle">
      <text x="20" y="9.4">A</text><text x="44" y="9.4">A</text><text x="20" y="17.4">B</text><text x="44" y="33.4">B</text><text x="28" y="17.4">C</text><text x="28" y="25.4">C</text>
    </g>
  </svg>`,
  configSchema: TY_CONFIG_SCHEMA,
  generate,
}
