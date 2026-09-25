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
import { rememberStudioContent, studioAvoidList } from '../studio-variety'
import { canLetter, composeQuotePage } from './compose'
import { QC_CONFIG_SCHEMA, validateQcConfig } from './config'
import {
  QC_AI_EMPTY_MESSAGE,
  QC_BUILD_FAILED_MESSAGE,
  QC_DEFAULT_TITLE,
  QC_FONTS_MISSING_MESSAGE,
  QC_PAGE_TOO_SMALL_MESSAGE,
  QC_TEMPLATE_KEY,
  compactQcLabel,
  parseQcBook,
  parseQcDetail,
  parseQcPattern,
  qcDetailSpec,
  qcInstruction,
  qcPageLabel,
  sayingsRepeat,
  selectQcSayings,
  type QcBookEntry,
} from './content'
import { dealQcDesign, qcStyleOrder } from './design'
import { buildQcPanel } from './draw'
import { checkQcDrawnPanel, runQcKdpPreflight } from './kdp-preflight'
import { boxToBounds, qcPanelFits, qcPanelInBody } from './layout'
import { parseQcRemoteData, qcVarietyKey, quoteColoringPrefetch } from './prefetch'

/** Pages composed before the page gives up and says so; each is a full layout and print check. */
const MAX_COMPOSE = 10

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
 * The sayings in the order the page tries them: the service's order, less
 * any the book already prints, and — while others remain — any this seller
 * printed lately.
 */
function sayingOrder(items: unknown, book: readonly QcBookEntry[], recent: readonly string[]): string[] {
  const fresh = selectQcSayings(items).filter((text) => !book.some((entry) => sayingsRepeat(entry.saying, text)))
  const unseen = fresh.filter((text) => !recent.some((label) => sayingsRepeat(label, text)))
  return unseen.length > 0 ? [...unseen, ...fresh.filter((text) => !unseen.includes(text))] : fresh
}

/**
 * One Quote Coloring page.
 *
 * Chosen, lettered, built, measured, checked. The saying is one the service
 * wrote and checked for originality, that this book does not already print;
 * the design is dealt against the book's other pages. The saying is lettered
 * from the font's own outlines at the biggest colorable size its space
 * allows, the pattern fills round it, and the whole page is printed to a
 * grid and every region measured. Then the preflight re-proves it: the
 * lettering reads exactly as the saying, nothing crosses into it, every
 * space clears the coloring floor. A design that fails is dealt again in
 * another face, then with the next saying; if nothing passes the page says
 * so plainly instead of printing a broken design.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const detail = qcDetailSpec(parseQcDetail(config.detail))
  const pattern = parseQcPattern(config.pattern)
  const ownerSalt = resolveOwnerSalt(ctx)
  const instruction = qcInstruction(config, ownerSalt)
  const tag: StudioTag = { templateKey: QC_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const box = qcPanelInBody(header.body, header.objects.length > 0)
  if (!qcPanelFits(box)) return fail(QC_PAGE_TOO_SMALL_MESSAGE)

  const remote = parseQcRemoteData(ctx.remoteData)
  if (Object.keys(remote.fonts).length === 0) return fail(QC_FONTS_MISSING_MESSAGE)
  const book = parseQcBook(remote.bookLabels)
  const varietyKey = qcVarietyKey(config)
  const sayings = sayingOrder(remote.items, book, studioAvoidList(varietyKey))
  if (sayings.length === 0) return fail(QC_AI_EMPTY_MESSAGE)

  const rngFor = (stream: string) =>
    createRngFromSeedInput({ ownerSalt, templateKey: QC_TEMPLATE_KEY, configHash: `${detail.value}:${pattern}`, pageNonce: ctx.seed, stream })
  const bounds = boxToBounds(box)
  let composed = 0

  for (let s = 0; s < sayings.length && composed < MAX_COMPOSE; s++) {
    const saying = sayings[s]!
    // Only the faces that can letter this saying on this trim at all: a
    // saying too long for every face is passed over before any pattern is
    // drawn for it.
    const styles = qcStyleOrder(remote.fonts, book, rngFor(`styles.${s}`)).filter((style) =>
      canLetter(bounds, remote.fonts[style.id]!, saying, style, detail),
    )
    for (let t = 0; t < styles.length && composed < MAX_COMPOSE; t++) {
      const style = styles[t]!
      const rng = rngFor(`page.${s}.${t}`)
      const dealt = dealQcDesign({ style, pattern, book, detail, rng, saying })
      // A saying too long for the medallion's width may still letter right
      // across the page; on a small trim a single-line frame and a plain
      // cartouche give it back the room their bands take. One too long even
      // for that is tried in the next face.
      const band = { ...dealt, layout: 'band' as const }
      const designs = [dealt, band, { ...band, frame: 'single' as const }, { ...band, frame: 'single' as const, cartouche: 'rounded' as const }].filter(
        (d, i, all) => all.findIndex((o) => o.layout === d.layout && o.frame === d.frame && o.cartouche === d.cartouche) === i,
      )
      let design = dealt
      let page = null as ReturnType<typeof composeQuotePage> | null
      for (const candidate of designs) {
        design = candidate
        page = composeQuotePage({ box: bounds, font: remote.fonts[style.id]!, saying, design, detail, rng })
        if (page.ok || page.stage !== 'lettering') break
      }
      if (!page) continue
      if (page.ok || page.stage === 'design') composed++
      if (!page.ok) continue
      if (!runQcKdpPreflight({ saying, design, page, detail, book }).ok) continue

      const entry: QcBookEntry = {
        saying,
        style: style.id,
        layout: design.layout,
        cartouche: design.cartouche,
        frame: design.frame,
        fill: design.fill,
        set: design.set,
      }
      const label = qcPageLabel(entry)
      const panel = buildQcPanel({ runs: page.runs, box, tag, label, canonical: `${label}|${detail.value}|${ctx.seed}` })
      if (checkQcDrawnPanel(panel, box).length > 0) continue

      rememberStudioContent(varietyKey, [compactQcLabel(saying)])
      return [{ pageRole: 'single', objects: [...header.objects, panel] }]
    }
  }
  return fail(QC_BUILD_FAILED_MESSAGE)
}

export const quoteColoringTemplate: StudioTemplateDefinition = {
  key: QC_TEMPLATE_KEY,
  label: 'Quote Coloring Page',
  category: 'spatial',
  description:
    'An original retirement saying in big outline letters to color, framed by a pattern of flowers, shapes or hobbies. Every saying is freshly written and checked for originality; every page gets its own lettering, border and pattern, and a book never repeats a saying.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: QC_DEFAULT_TITLE,
  prefetch: quoteColoringPrefetch,
  validateConfig: validateQcConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="3" width="52" height="34" rx="3" stroke-width="1.3"/>
      <rect x="15" y="12" width="34" height="16" rx="4" stroke-width="1"/>
      <path d="M19 17.5h3.5M20.75 17.5v6M25 17.5v6M25 20.5h3M28 17.5v6M31.5 17.5h3M31.5 17.5v6M31.5 20.5h2.5M31.5 23.5h3M37 17.5v6h3M42 17.5v6" stroke-width="0.9"/>
      <g stroke-width="0.7">
        <circle cx="11" cy="8" r="2.4"/><circle cx="11" cy="8" r="0.9"/>
        <circle cx="53" cy="8" r="2.4"/><circle cx="53" cy="8" r="0.9"/>
        <circle cx="11" cy="32" r="2.4"/><circle cx="11" cy="32" r="0.9"/>
        <circle cx="53" cy="32" r="2.4"/><circle cx="53" cy="32" r="0.9"/>
        <path d="M24 7.5q2-2.5 4 0t4 0 4 0 4 0M24 32.5q2-2.5 4 0t4 0 4 0 4 0"/>
      </g>
    </g>
  </svg>`,
  configSchema: QC_CONFIG_SCHEMA,
  generate,
}
