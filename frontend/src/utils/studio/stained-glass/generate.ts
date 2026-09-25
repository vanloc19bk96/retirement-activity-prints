import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, contentBox, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { SG_CONFIG_SCHEMA } from './config'
import {
  SG_BUILD_FAILED_MESSAGE,
  SG_DEFAULT_TITLE,
  SG_PAGE_TOO_SMALL_MESSAGE,
  SG_TEMPLATE_KEY,
  parseSgBook,
  parseSgLevel,
  parseSgTheme,
  pickSgDesign,
  sgDesignEntry,
  sgInstruction,
  sgLevelSpec,
  sgPageLabel,
  sgVariantDrawing,
  sgVariantKey,
} from './content'
import { buildSgPanel } from './draw'
import { checkSgDrawnPanel, runSgKdpPreflight } from './kdp-preflight'
import { boxToBounds, panelFits, sgPanelInBody } from './layout'
import { buildMosaic } from './mosaic'
import { parseSgRemoteData, stainedGlassPrefetch } from './prefetch'
import {
  applySgHand,
  dealSgHand,
  dealSgStyle,
  easeSgHand,
  parseSgStyleToken,
  sgMosaicStyle,
  sgStyleFavor,
  sgStyleInk,
  sgStyleToken,
  type SgBookStyle,
} from './style'

/** One ledger for the whole template: a seller's next book opens with other subjects. */
const VARIETY_KEY = studioVarietyKey(SG_TEMPLATE_KEY, 'subjects')
/** About two thirds of the library: recent subjects wait, but a theme never runs dry. */
const RECENT_WINDOW = 24
/** The versions this seller printed (`subject:version`); a few books' worth. */
const ART_VARIETY_KEY = studioVarietyKey(SG_TEMPLATE_KEY, 'art')
const RECENT_ART_WINDOW = 200
/** Book styles this seller printed lately; a new book is dealt one far from them. */
const STYLE_VARIETY_KEY = studioVarietyKey(SG_TEMPLATE_KEY, 'styles')
const RECENT_STYLE_WINDOW = 12
/** Designs tried before the page gives up and says so. */
const ATTEMPTS = 6
/**
 * Mosaics dealt for one design before its subject is set aside, and the
 * strength of the page's hand on each: as dealt, then eased (a narrow part
 * the full hand pinched), then plain.
 */
const HAND_STRENGTHS = [1, 0.5, 0] as const

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(contentBox(ctx), config, tag, instruction)
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
 * The book's style: the one its Stained Glass pages already carry (the latest,
 * should a book hold two), else a new one for this book.
 */
function resolveBookStyle(book: readonly { style?: string }[], ownerSalt: string, seed: number): { style: SgBookStyle; fresh: boolean } {
  for (let i = book.length - 1; i >= 0; i--) {
    const style = parseSgStyleToken(book[i]!.style)
    if (style) return { style, fresh: false }
  }
  const recent = studioAvoidList(STYLE_VARIETY_KEY, RECENT_STYLE_WINDOW)
  return { style: dealSgStyle({ ownerSalt, seed, recent }), fresh: true }
}

/**
 * One Stained Glass page.
 *
 * Chosen, built, measured, checked. The design (subject, version,
 * composition) is dealt against what the book and this seller have already
 * printed; the mosaic is built and every region printed to a grid and
 * measured, with slivers merged away; the result then has to pass the
 * preflight (a real subject, big enough, a true mosaic, not a page the book
 * already has) and the drawn check (black lines only, inside the panel). A
 * design that fails anywhere is dropped and another dealt — a different
 * subject if the subject was the problem — and if none passes the page says
 * so plainly instead of printing a broken panel.
 *
 * Every page is drawn in its book's style (pen, favoured window, border
 * proportions, the hand its subjects are drawn in — see `style.ts`) and with
 * its own hand on top, so two sellers, or two books of one seller, that land
 * on the same subject and window still print different pictures.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseSgLevel(config.level)
  const theme = parseSgTheme(config.theme)
  const ownerSalt = resolveOwnerSalt(ctx)
  const instruction = sgInstruction(config, ownerSalt)
  const tag: StudioTag = { templateKey: SG_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const box = sgPanelInBody(header.body, header.objects.length > 0)
  if (!panelFits(box)) return fail(SG_PAGE_TOO_SMALL_MESSAGE)

  const book = parseSgBook(parseSgRemoteData(ctx.remoteData).bookLabels)
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentArt = studioAvoidList(ART_VARIETY_KEY, RECENT_ART_WINDOW)
  const { detail } = sgLevelSpec(level)
  const exclude = new Set<string>()
  const { style, fresh } = resolveBookStyle(book, ownerSalt, ctx.seed)
  const styleToken = sgStyleToken(style)
  const ink = sgStyleInk(style)

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const design = pickSgDesign({
      theme,
      seed: ctx.seed,
      ownerSalt,
      aspect: box.height / box.width,
      span: Math.min(box.width, box.height) / detail.cell,
      book,
      recent,
      recentArt,
      exclude,
      attempt,
      favor: sgStyleFavor(style),
    })
    if (!design) break
    // A failed build is usually the scenery landing badly (a hill line
    // grazing a corner of the subject), so the same design gets a second
    // deal of its mosaic before the subject is set aside for this page. Each
    // deal eases the hand, in case the hand was the trouble.
    let mosaic: ReturnType<typeof buildMosaic> | null = null
    for (let deal = 0; deal < HAND_STRENGTHS.length && !mosaic?.ok; deal++) {
      const rng = createRngFromSeedInput({
        ownerSalt,
        templateKey: SG_TEMPLATE_KEY,
        configHash: `mosaic:${level}`,
        pageNonce: ctx.seed,
        stream: `${attempt}.${deal}`,
      })
      const hand = easeSgHand(dealSgHand(style, design.subject, rng), HAND_STRENGTHS[deal]!)
      mosaic = buildMosaic({
        box: boxToBounds(box),
        drawing: applySgHand(sgVariantDrawing(design.subject, design.variant), hand),
        grounded: design.subject.ground !== 'none',
        composition: design.composition,
        detail,
        rng,
        style: sgMosaicStyle(style, hand),
      })
    }
    if (!mosaic?.ok) {
      exclude.add(design.subject.id)
      continue
    }
    if (!runSgKdpPreflight({ design, mosaic, book }).ok) continue

    const entry = sgDesignEntry(design, styleToken)
    const label = sgPageLabel(entry)
    const panel = buildSgPanel({ runs: mosaic.runs, box, tag, label, canonical: `${label}|${level}|${ctx.seed}` })
    if (checkSgDrawnPanel(panel, box, ink).length > 0) continue

    if (fresh) rememberStudioContent(STYLE_VARIETY_KEY, [styleToken])
    rememberStudioContent(VARIETY_KEY, [design.subject.id])
    rememberStudioContent(ART_VARIETY_KEY, [`${design.subject.id}:${sgVariantKey(design.subject, design.variant)}`])
    return [{ pageRole: 'single', objects: [...header.objects, panel] }]
  }
  return fail(SG_BUILD_FAILED_MESSAGE)
}

export const stainedGlassTemplate: StudioTemplateDefinition = {
  key: SG_TEMPLATE_KEY,
  label: 'Stained Glass Coloring',
  category: 'spatial',
  description:
    'A relaxing coloring page: a retirement favorite — a rocking chair, a teapot, a sailboat, a sunflower — set in a stained-glass window of bold, closed pieces. Pick a theme and a piece size; every page deals its own subject, window, border and background, each book gets its own look, and a book never repeats a design.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: SG_DEFAULT_TITLE,
  prefetch: stainedGlassPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 38V16a12 12 0 0 1 24 0v22z" stroke-width="1.4"/>
      <path d="M22.5 36V16.5a9.5 9.5 0 0 1 19 0V36z" stroke-width="0.8"/>
      <g stroke-width="0.6">
        <path d="M22.5 22l5 2M41.5 21l-5 2.5M32 7v4M24 11.5l3.5 3M40 11.5l-3.5 3M22.5 31l4.5-2M41.5 31l-4.5-2.5M27 36l1.5-4M37 36l-1.5-4"/>
      </g>
      <g stroke-width="1.1">
        <path d="M27.5 21h9v8.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z"/>
        <path d="M36.5 23.2h1.6a2.3 2.3 0 0 1 0 4.6h-1.6"/>
        <path d="M30.5 19.5q-1-1.5 0-3t0-3M33.5 19.5q-1-1.5 0-3t0-3"/>
      </g>
    </g>
  </svg>`,
  configSchema: SG_CONFIG_SCHEMA,
  generate,
}
