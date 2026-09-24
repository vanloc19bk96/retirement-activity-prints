import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader, type Box } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { OR_CONFIG_SCHEMA, instructionFor } from './config'
import {
  OR_BOOK_FULL_MESSAGE,
  OR_BUILD_FAILED_MESSAGE,
  OR_DEFAULT_TITLE,
  OR_PAGE_TOO_SMALL_MESSAGE,
  OR_TEMPLATE_KEY,
  bookRelicIds,
  levelSpec,
  orInstructionOptions,
  parseOrLevel,
  pickRelics,
  type PlacedRelic,
} from './content'
import { drawOrPage, type OrDrawMode } from './draw'
import { checkOrDrawnPage, runOrKdpPreflight } from './kdp-preflight'
import { orCardField, orContentBox, orWorstCasePlan, type OrPagePlan } from './layout'
import { officeRelicsPrefetch, parseOrRemoteData } from './prefetch'
import { orHouseStyle, type OrHouseStyle } from './style'
import { artLabel } from './variants'

/** One ledger for the whole template: a seller's next book starts with other objects. */
const VARIETY_KEY = studioVarietyKey(OR_TEMPLATE_KEY, 'objects')
/** About half the catalog: recent objects wait their turn, but the pool never runs dry. */
const RECENT_WINDOW = 24
/** The versions of each drawing this seller printed; each object has 8 or more, so a few books' worth. */
const ART_VARIETY_KEY = studioVarietyKey(OR_TEMPLATE_KEY, 'art')
const RECENT_ART_WINDOW = 200

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
  instruction: string,
): StudioPageOutput {
  const header = drawHeader(orContentBox(ctx), config, tag, instruction)
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

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: OrPagePlan
  items: readonly PlacedRelic[]
  wordBank: boolean
  font: string
  instruction: string
  mode: OrDrawMode
  style: OrHouseStyle
}): { objects: StudioFabricObject[]; field: Box } {
  const { config, ctx, tag, plan, items, wordBank, font, instruction, mode, style } = options
  const header = drawHeader(orContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  const field = orCardField(header.body)
  drawOrPage(objects, { field, plan, items, wordBank, font, tag, mode, style })
  return { objects, field }
}

/**
 * One page of Office Relics, and its answer page.
 *
 * Measured first, filled second, checked twice. The plan fixes the grid,
 * picture size and line weight from the trim alone, so the form's note is what
 * prints and every page of a run matches. Objects are then dealt from the
 * catalog — never one the book already shows, rarely one this seller printed
 * lately — each in a version of its drawing dealt from the seller's salt, and
 * the page wears the seller's house style, so two sellers' books do not print
 * the same pictures on the same page. The page is proved twice: once as data (every object valid,
 * drawn, fair to name, on its line) and once as drawn (every picture inside
 * the page, clear of its neighbours and of every writing line). A page that
 * fails either becomes a plain message, never a broken sheet.
 *
 * The answer page is drawn from the very same objects in the same order, so a
 * name can only print under its own picture.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const level = parseOrLevel(config.level)
  const { wordBank } = levelSpec(level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const style = orHouseStyle(ownerSalt)
  const instruction = instructionFor(config, style.instruction)
  const tag: StudioTag = { templateKey: OR_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  // Fitted to the tallest phrasing, so the plan (and the form's note) is the same for every seller.
  const plan = orWorstCasePlan({ page: ctx, config, level, instructions: orInstructionOptions(config), font })
  if (!plan) return fail(OR_PAGE_TOO_SMALL_MESSAGE)

  const book = bookRelicIds(parseOrRemoteData(ctx.remoteData).bookIds)
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentArt = studioAvoidList(ART_VARIETY_KEY, RECENT_ART_WINDOW)
  const items = pickRelics({ count: plan.count, level, seed: ctx.seed, book, recent, ownerSalt, recentArt })
  if (items.length < plan.count) return fail(book.length > 0 ? OR_BOOK_FULL_MESSAGE : OR_BUILD_FAILED_MESSAGE)

  const preflight = runOrKdpPreflight({ items, plan, font, wordBank, book })
  if (!preflight.ok) return fail(preflight.errors[0] ?? OR_BUILD_FAILED_MESSAGE)

  const shared = { config, ctx, tag, plan, items, wordBank, font, style }
  const puzzle = layoutPage({ ...shared, instruction, mode: 'puzzle' })
  // Same numbers and pictures, each name on its line. The how-to line and the
  // word bank are dropped: a reader checking answers has no use for either.
  const answers = layoutPage({ ...shared, instruction: '', mode: 'answers' })
  const drawn = [
    ...checkOrDrawnPage(puzzle.objects, puzzle.field, plan.count),
    ...checkOrDrawnPage(answers.objects, answers.field, plan.count),
  ]
  if (drawn.length > 0) return fail(drawn[0]!)

  rememberStudioContent(
    VARIETY_KEY,
    items.map((item) => item.relic.id),
  )
  rememberStudioContent(
    ART_VARIETY_KEY,
    items.map((item) => artLabel(item.drawing, item.variant)),
  )
  return [{ pageRole: 'single', objects: puzzle.objects, answerSourceObjects: answers.objects }]
}

export const officeRelicsTemplate: StudioTemplateDefinition = {
  key: OR_TEMPLATE_KEY,
  label: 'Office Relics',
  category: 'word',
  description:
    'A nostalgic picture game: name each piece of old office equipment, from the typewriter and rotary phone to the punch clock and slide rule. Every object is a clean black line drawing made for print, and the answer page accepts the other names people use (card file or Rolodex). Pick a level — Gentle adds a word bank; pictures per page and their size are fitted to your page. Never repeats an object already in your book.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: OR_DEFAULT_TITLE,
  prefetch: officeRelicsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <g stroke-width="0.5" opacity="0.5">
        <rect x="3" y="3" width="27" height="34" rx="1.5"/>
        <rect x="34" y="3" width="27" height="34" rx="1.5"/>
      </g>
      <g stroke-width="1">
        <path d="M8.5 11.5q0-2 2.5-2h1.5q1.2 0 1.6-.8q2.4-1.6 4.8 0q.4.8 1.6.8h1.5q2.5 0 2.5 2q0 1-1.5 1h-3q-.8 0-1.2-.8q-2.2-1.2-4.4 0q-.4.8-1.2.8h-3q-1.5 0-1.5-1z"/>
        <path d="M10 25l1.8-9h9.4l1.8 9z"/>
        <circle cx="16.5" cy="19.5" r="3"/>
        <path d="M44 16v-6h9v6"/>
        <rect x="39.5" y="15.5" width="18" height="2.4" rx="1.2"/>
        <path d="M41 18h15l2 6h-19z"/>
      </g>
      <g stroke-width="0.8">
        <path d="M11 32.5h14M42 32.5h14"/>
      </g>
    </g>
    <g fill="currentColor">
      <circle cx="43.5" cy="20.2" r="0.55"/><circle cx="45.8" cy="20.2" r="0.55"/><circle cx="48.1" cy="20.2" r="0.55"/><circle cx="50.4" cy="20.2" r="0.55"/><circle cx="52.7" cy="20.2" r="0.55"/><circle cx="55" cy="20.2" r="0.55"/>
      <circle cx="44.2" cy="22.3" r="0.55"/><circle cx="46.5" cy="22.3" r="0.55"/><circle cx="48.8" cy="22.3" r="0.55"/><circle cx="51.1" cy="22.3" r="0.55"/><circle cx="53.4" cy="22.3" r="0.55"/>
    </g>
    <g font-family="serif" font-size="3.6" font-weight="700" fill="currentColor">
      <text x="6" y="33.5">1.</text>
      <text x="37" y="33.5">2.</text>
    </g>
  </svg>`,
  configSchema: OR_CONFIG_SCHEMA,
  generate,
}
