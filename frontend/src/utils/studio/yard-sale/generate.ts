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
import { YS_CONFIG_SCHEMA } from './config'
import {
  YS_BUILD_FAILED_MESSAGE,
  YS_DEFAULT_TITLE,
  YS_SALES,
  YS_TEMPLATE_KEY,
  parseYsBook,
  parseYsLevel,
  pickYsSale,
  ysGridRng,
  ysInstruction,
  ysLevelSpec,
  ysPageLabel,
  ysPageTooSmallMessage,
} from './content'
import { buildYsPuzzle } from './draw'
import { checkYsDrawnPage, runYsKdpPreflight } from './kdp-preflight'
import { planYsPage, ysContentBox, ysPanelInBody } from './layout'
import { parseYsRemoteData, yardSalePrefetch } from './prefetch'
import { buildYsGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other sales. */
const VARIETY_KEY = studioVarietyKey(YS_TEMPLATE_KEY, 'sales')
/** Building streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(ysContentBox(ctx), config, tag, instruction)
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
 * One Yard Sale page, and the answer page with every square to shade shaded.
 *
 * Planned, built, proven, drawn, checked. The trim alone fixes how large the
 * squares print, so the form's help line is what prints. The sale's name is
 * dealt against what the book and this seller have already printed; the
 * grid and its numbers are built fresh from the seller's salt and the page
 * seed and must pass the preflight (every rule kept; finished by the level's
 * own logic on exactly its one answer and not by easier steps alone where
 * the level asks for more; the level's share shaded; large print; on the
 * page; not a repeat) and the drawn check (every number in its own square,
 * the shading waiting hidden on exactly the answer's squares). A grid that
 * fails anywhere is set aside and another built; if none passes, the page
 * says so plainly instead of printing a grid a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseYsLevel(config.level)
  const spec = ysLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = ysInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: YS_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(ysContentBox(ctx), config, tag, instruction)
  const panel = ysPanelInBody(header.body, header.objects.length > 0)
  const plan = planYsPage(panel, level, font)
  if (!plan) return fail(ysPageTooSmallMessage(spec))

  const book = parseYsBook(parseYsRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of sales: a seller's next book opens at sales their
  // last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, YS_SALES.length - 6)
  const sale = pickYsSale({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildYsGrid({ ...spec, rng: ysGridRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runYsKdpPreflight({ built, plan, level, sale, panel, font, book }).ok) continue

    const label = ysPageLabel(sale, level, built.signature)
    const draw = () => buildYsPuzzle({ built, plan, sale, level, label, tag, font })
    const puzzle = draw()
    if (checkYsDrawnPage({ puzzle, built, sale }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [sale.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and every square to shade is shaded.
        answerSourceObjects: [...drawHeader(ysContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(YS_BUILD_FAILED_MESSAGE)
}

export const yardSaleTemplate: StudioTemplateDefinition = {
  key: YS_TEMPLATE_KEY,
  label: 'Yard Sale: Clear the Clutter',
  category: 'logic',
  description:
    'The shade-the-repeats number grid puzzle fans swear by (known in puzzle books as Hitori), set as a retiree’s big clear-out: shade the repeated numbers until no row or column shows one twice, never two shaded squares side by side, and every white square still joined. Every grid is built fresh, proven to have one answer reached by logic alone, and named for a clear-out worth getting round to, like the Attic Treasures Sale, the Workshop Clear-Out, the Grandkids’ Toy Swap. Three levels from a 6 × 6 to a 9 × 9, and an answer page with every square to shade shaded.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: YS_DEFAULT_TITLE,
  prefetch: yardSalePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" opacity="0.35">
      <rect x="21.5" y="2.5" width="7" height="7"/>
      <rect x="35.5" y="9.5" width="7" height="7"/>
      <rect x="14.5" y="16.5" width="7" height="7"/>
      <rect x="28.5" y="23.5" width="7" height="7"/>
      <rect x="42.5" y="30.5" width="7" height="7"/>
    </g>
    <path d="M21.5 2.5V37.5M28.5 2.5V37.5M35.5 2.5V37.5M42.5 2.5V37.5M14.5 9.5H49.5M14.5 16.5H49.5M14.5 23.5H49.5M14.5 30.5H49.5" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.45"/>
    <rect x="14.5" y="2.5" width="35" height="35" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <g fill="currentColor" font-family="sans-serif" font-size="5" font-weight="700" text-anchor="middle">
      <text x="18" y="7.8">2</text><text x="25" y="7.8">3</text><text x="32" y="7.8">1</text><text x="39" y="7.8">3</text><text x="46" y="7.8">4</text>
      <text x="18" y="14.8">4</text><text x="25" y="14.8">1</text><text x="32" y="14.8">5</text><text x="39" y="14.8">4</text><text x="46" y="14.8">2</text>
      <text x="18" y="21.8">1</text><text x="25" y="21.8">5</text><text x="32" y="21.8">2</text><text x="39" y="21.8">1</text><text x="46" y="21.8">3</text>
      <text x="18" y="28.8">3</text><text x="25" y="28.8">4</text><text x="32" y="28.8">4</text><text x="39" y="28.8">5</text><text x="46" y="28.8">1</text>
      <text x="18" y="35.8">5</text><text x="25" y="35.8">2</text><text x="32" y="35.8">4</text><text x="39" y="35.8">1</text><text x="46" y="35.8">5</text>
    </g>
  </svg>`,
  configSchema: YS_CONFIG_SCHEMA,
  generate,
}
