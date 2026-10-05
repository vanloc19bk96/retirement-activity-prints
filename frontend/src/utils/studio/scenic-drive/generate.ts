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
import { DRIVE_CONFIG_SCHEMA } from './config'
import {
  DRIVE_BUILD_FAILED_MESSAGE,
  DRIVE_DEFAULT_TITLE,
  DRIVE_ROUTES,
  DRIVE_TEMPLATE_KEY,
  driveGridRng,
  driveInstruction,
  driveLevelSpec,
  drivePageLabel,
  drivePageTooSmallMessage,
  parseDriveBook,
  parseDriveLevel,
  pickDriveRoute,
} from './content'
import { buildDrivePuzzle } from './draw'
import { checkDriveDrawnPage, runDriveKdpPreflight } from './kdp-preflight'
import { driveContentBox, drivePanelInBody, planDrivePage } from './layout'
import { parseDriveRemoteData, scenicDrivePrefetch } from './prefetch'
import { buildDriveGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other routes. */
const VARIETY_KEY = studioVarietyKey(DRIVE_TEMPLATE_KEY, 'routes')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(driveContentBox(ctx), config, tag, instruction)
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
 * One Scenic Drive page, and the answer page with every digit written in.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large
 * the squares print, so the form's help line is what prints. The route's
 * name is dealt against what the book and this seller have already printed;
 * the grid, its gray squares and its totals are built fresh from the
 * seller's salt and the page seed and must pass the preflight (a proper,
 * balanced grid with runs the level allows; one answer adding up to every
 * total; finished by the level's own logic on exactly that answer and not
 * by easier steps alone where the level asks for more; large print; every
 * total clear of its diagonal; on the page; not a repeat) and the drawn
 * check (every square, total and diagonal in place, every digit waiting in
 * its own square). A grid that fails anywhere is set aside and another
 * built; if none passes, the page says so plainly instead of printing a
 * grid a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseDriveLevel(config.level)
  const spec = driveLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = driveInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: DRIVE_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(driveContentBox(ctx), config, tag, instruction)
  const panel = drivePanelInBody(header.body, header.objects.length > 0)
  const plan = planDrivePage(panel, level, font)
  if (!plan) return fail(drivePageTooSmallMessage(spec))

  const book = parseDriveBook(parseDriveRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at routes their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, DRIVE_ROUTES.length - 6)
  const route = pickDriveRoute({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildDriveGrid({ ...spec, rng: driveGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runDriveKdpPreflight({ built, plan, level, route, panel, font, book }).ok) continue

    const label = drivePageLabel(route, level, built.signature)
    const draw = () => buildDrivePuzzle({ built, plan, route, level, label, tag, font })
    const puzzle = draw()
    if (checkDriveDrawnPage({ puzzle, built, route }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [route.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every digit is written in.
        answerSourceObjects: [...drawHeader(driveContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(DRIVE_BUILD_FAILED_MESSAGE)
}

export const scenicDriveTemplate: StudioTemplateDefinition = {
  key: DRIVE_TEMPLATE_KEY,
  label: 'Scenic Drive: Add Up the Miles',
  category: 'logic',
  description:
    'The cross-sums puzzle (Kakuro) that fills whole books in the puzzle aisle, laid out as a retiree’s road trip: every run of white squares is a leg of the drive, and its digits, 1 to 9 with none twice, add up to the miles in the gray marker before it, across or down. Every grid is built fresh, balanced like a crossword, proven to have one answer reached by logic alone, and named for a drive worth taking: the Blue Ridge Parkway, a Covered Bridge Byway, the Road Trip to the Grandkids. Three levels, large print, and an answer page with every digit written in.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: DRIVE_DEFAULT_TITLE,
  prefetch: scenicDrivePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="60" height="36" fill="currentColor" opacity="0.12"/>
    <rect x="24" y="12" width="24" height="24" fill="white"/>
    <path d="M16 4H48V12H24V36H16Z" fill="currentColor" opacity="0.3"/>
    <path d="M24 4V36M32 4V36M40 4V36M16 12H48M16 20H48M16 28H48" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.8"/>
    <path d="M24 4L32 12M32 4L40 12M40 4L48 12M16 12L24 20M16 20L24 28M16 28L24 36" fill="none" stroke="currentColor" stroke-width="0.5"/>
    <rect x="16" y="4" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <g fill="currentColor" font-family="sans-serif" font-size="3.2" font-weight="700" text-anchor="middle">
      <text x="26.3" y="10.8">13</text>
      <text x="34.3" y="10.8">12</text>
      <text x="42.3" y="10.8">13</text>
      <text x="21.7" y="15.5">24</text>
      <text x="21.7" y="23.5">6</text>
      <text x="21.7" y="31.5">8</text>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="5.5" text-anchor="middle">
      <text x="28" y="18">9</text>
      <text x="44" y="26">2</text>
      <text x="36" y="34">1</text>
    </g>
  </svg>`,
  configSchema: DRIVE_CONFIG_SCHEMA,
  generate,
}
