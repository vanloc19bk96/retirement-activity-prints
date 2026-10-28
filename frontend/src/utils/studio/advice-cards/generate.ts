import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT, STUDIO_INSTRUCTION_SIZE } from '@/constants/studio.constants'
import { boxCenterX, drawHeader, estimateWrappedLines, isStudioHeaderTitle } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { createRng, deriveSeed } from '../studio-rng'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  WW_FRAME_STYLES,
  WW_MOTIFS,
  dealPrompts,
  parseWwName,
  pickFresh,
  wwLabel,
  type WwMemory,
} from '../well-wishes/content'
import { drawOrnament, type DrawContext } from '../well-wishes/draw'
import { wrapIntro } from '../well-wishes/generate'
import { headingFits, ornamentStrip, ornamentTop, wwContentBox, wwField, type WwPageHead } from '../well-wishes/layout'
import { AC_CONFIG_SCHEMA, validateAcConfig } from './config'
import {
  AC_BUILD_FAILED_MESSAGE,
  AC_DEFAULT_TITLE,
  AC_LIST_PROMPTS,
  AC_PAGE_TOO_SMALL_MESSAGE,
  AC_TEMPLATE_KEY,
  acCrowdedMessage,
  acHeadingText,
  acHeadingsFor,
  acIntroText,
  acIntrosFor,
  acPromptsFor,
  acSignoffsFor,
  parseAcAudience,
  parseAcCards,
  parseAcPages,
} from './content'
import { drawCard, drawCuts } from './draw'
import { runAcKdpPreflight } from './kdp-preflight'
import {
  acGrid,
  cardInnerWidth,
  cardTitleFont,
  cardWidthFor,
  chooseLabelFont,
  fittingSignoffs,
  planPage,
  wrapPrompt,
  type AcCardHead,
  type AcPagePlan,
} from './layout'
import { adviceCardsPrefetch, parseAcRemoteData } from './prefetch'

/** An intro longer than this many lines eats writing room; it is never printed. */
const INTRO_MAX_LINES = 2
/** Seller memory windows: about two sets' worth of looks, and of prompts. */
const RECENT_DESIGN = 12
const RECENT_PROMPTS = 32

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const header = drawHeader(wwContentBox(ctx), config, tag, '')
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
 * A set of advice card pages: a heading, one short line of how-to, then one,
 * two or four framed cards per page, each a sentence for a guest to finish,
 * writing lines and a signature line. Cut-apart sets add dashed cut lines and
 * put the heading on every card.
 *
 * Measured first, chosen second, checked third. The grid comes from the trim
 * and the cards per page alone; the look (heading, intro, frame, ornament,
 * sign-off) is picked by seed away from what this book and this seller printed
 * last; prompts are dealt one per card; and the preflight re-proves every page
 * before anything is returned. No answer page: the advice is written by hand.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const name = parseWwName(config.retireeName)
  const audience = parseAcAudience(config.audience)
  const pageCount = parseAcPages(config.pages)
  const cards = parseAcCards(config.cardsPerPage)
  const cutApart = config.cutApart === true
  const tag: StudioTag = { templateKey: AC_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]
  const content = wwContentBox(ctx)

  const designKey = studioVarietyKey(AC_TEMPLATE_KEY, audience, 'design')
  const promptKey = studioVarietyKey(AC_TEMPLATE_KEY, audience, 'prompts')
  const memory: WwMemory = {
    book: new Set(parseAcRemoteData(ctx.remoteData).bookLabels),
    recent: new Set([...studioAvoidList(designKey, RECENT_DESIGN), ...studioAvoidList(promptKey, RECENT_PROMPTS)]),
  }
  const pick = (salt: string) => createRng(deriveSeed(ctx.seed, salt))

  const typedTitle = String(config.title ?? '').trim()
  const autoTitle = typedTitle === AC_DEFAULT_TITLE
  const showIntro = config.showInstructions !== false

  // The grid, from stand-ins: which words print never changes how many cards fit.
  const sampleHead: WwPageHead = { title: typedTitle ? 'x' : '', instruction: showIntro ? 'x' : '' }
  const planned = acGrid(ctx, config, sampleHead, cards, cutApart)
  if (!planned) {
    return fail(acGrid(ctx, config, sampleHead, 1, cutApart) ? acCrowdedMessage(cards) : AC_PAGE_TOO_SMALL_MESSAGE)
  }

  const frame = pickFresh(pick('frame'), WW_FRAME_STYLES, wwLabel.frame, memory)
  const innerWidth = cardInnerWidth(cardWidthFor(planned.field.width, planned.grid.cols, cutApart), frame)
  const onCard = (text: string) => !cutApart || cardTitleFont(text, innerWidth, font) > 0

  // Heading: one of ours, for the page when the title is left as the default and for every cut-apart card.
  const headings = acHeadingsFor(audience).filter(
    (h) => (!autoTitle || headingFits(h.plain, content.width, font)) && onCard(h.plain),
  )
  if (headings.length === 0) return fail(AC_PAGE_TOO_SMALL_MESSAGE)
  const heading = pickFresh(pick('heading'), headings, (h) => wwLabel.heading(h.id), memory)
  const named = acHeadingText(heading, name)
  const pageTitle = autoTitle ? (headingFits(named, content.width, font) ? named : heading.plain) : typedTitle
  let cardTitle = ''
  if (cutApart) {
    const own = typedTitle && !autoTitle && onCard(typedTitle) ? typedTitle : ''
    cardTitle = own || (onCard(named) ? named : heading.plain)
  }
  const headingOnPage = autoTitle
  const headingOnCard = cutApart && cardTitle !== typedTitle

  // Intro: one or two lines, never more.
  let instruction = ''
  let introId = ''
  if (showIntro) {
    const fitsIntro = (text: string) =>
      estimateWrappedLines(wrapIntro(text, content.width, font), STUDIO_INSTRUCTION_SIZE, content.width) <= INTRO_MAX_LINES
    const candidates = acIntrosFor(audience).filter((i) => fitsIntro(i.plain))
    if (candidates.length > 0) {
      const intro = pickFresh(pick('intro'), candidates, (i) => wwLabel.intro(i.id), memory)
      const text = acIntroText(intro, name)
      instruction = wrapIntro(fitsIntro(text) ? text : intro.plain, content.width, font)
      introId = intro.id
    }
  }

  const { labelFont, pool } = chooseLabelFont(
    acPromptsFor(audience).map((p) => p.text),
    innerWidth,
    font,
  )
  const signoffs = fittingSignoffs(acSignoffsFor(audience), innerWidth, labelFont, font)
  if (pool.length === 0 || signoffs.length === 0) return fail(AC_PAGE_TOO_SMALL_MESSAGE)
  const signoff = pickFresh(pick('signoff'), signoffs, wwLabel.signoff, memory)
  const motif = pickFresh(pick('motif'), WW_MOTIFS, wwLabel.motif, memory)

  const cardHead: AcCardHead = { title: cardTitle, titleFont: cardTitle ? cardTitleFont(cardTitle, innerWidth, font) : 0 }
  const heads: WwPageHead[] = Array.from({ length: pageCount }, (_, index) => ({
    title: pageTitle,
    instruction: index === 0 ? instruction : '',
  }))
  const pagePlans: AcPagePlan[] = []
  for (const head of heads) {
    const pagePlan = planPage(wwField(ctx, config, head), planned.grid, { cutApart, frame, labelFont, head: cardHead })
    if (!pagePlan) return fail(acCrowdedMessage(cards))
    pagePlans.push(pagePlan)
  }
  const plan = { labelFont, pages: pagePlans }

  const prompts = dealPrompts(
    pick('prompts'),
    pool,
    pagePlans.map((p) => p.cards.length),
    memory,
  )
  if (!prompts) return fail(AC_BUILD_FAILED_MESSAGE)

  const preflight = runAcKdpPreflight({
    page: ctx,
    plan,
    pages: pageCount,
    cardsPerPage: cards,
    head: cardHead,
    prompts,
    signoff,
    title: pageTitle,
    generatedTitle: autoTitle,
    font,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? AC_BUILD_FAILED_MESSAGE)

  const headingLabel = wwLabel.heading(heading.id)
  const showsOrnament = Boolean(heads[0]!.title || heads[0]!.instruction)
  rememberStudioContent(designKey, [
    ...(headingOnPage || headingOnCard ? [headingLabel] : []),
    ...(introId ? [wwLabel.intro(introId)] : []),
    wwLabel.frame(frame),
    wwLabel.signoff(signoff),
    ...(showsOrnament ? [wwLabel.motif(motif)] : []),
  ])
  rememberStudioContent(promptKey, prompts.flat().map(wwLabel.prompt))

  return pagePlans.map((pagePlan, index) => {
    const head = heads[index]!
    const header = drawHeader(content, { ...config, title: head.title }, tag, head.instruction)
    // Stamp what the header printed, so a later set in the book can steer clear.
    const objects: StudioFabricObject[] = header.objects.map((obj) => {
      const label = isStudioHeaderTitle(obj) ? (headingOnPage ? headingLabel : '') : introId ? wwLabel.intro(introId) : ''
      return label && index === 0 ? { ...obj, data: { ...obj.data, [STUDIO_CONTENT_LABEL_KEY]: label } } : obj
    })
    const draw: DrawContext = { objects, tag, font }
    if (ornamentStrip(header.body.top - content.top) > 0) {
      drawOrnament(draw, { column: content, top: ornamentTop(header.body.top), motif, label: wwLabel.motif(motif) })
    }
    drawCuts(draw, pagePlan.cuts)
    pagePlan.cards.forEach((card, c) => {
      const prompt = prompts[index]![c]!
      const first = index === 0 && c === 0
      drawCard(draw, {
        card,
        frame,
        head: cardHead,
        labelFont,
        promptLines: wrapPrompt(prompt, labelFont, card.innerWidth, font),
        list: AC_LIST_PROMPTS.has(prompt),
        signoff,
        labels: {
          frame: first ? wwLabel.frame(frame) : undefined,
          title: first && headingOnCard && !headingOnPage ? headingLabel : undefined,
          prompt: wwLabel.prompt(prompt),
          signoff: first ? wwLabel.signoff(signoff) : undefined,
        },
      })
    })
    return { pageRole: 'single', objects }
  })
}

export const adviceCardsTemplate: StudioTemplateDefinition = {
  key: AC_TEMPLATE_KEY,
  label: 'Advice for the Retiree',
  category: 'keepsake',
  description:
    'Advice cards for a retirement party or keepsake book. Each card starts a sentence for a guest to finish (“The secret to a happy retirement is…”, “Places you should visit:”), with roomy writing lines and a line to sign. Choose 1, 2 or 4 cards per page, add the retiree’s name, or print cut-apart cards with dashed cut lines. Every set gets its own heading, frame and prompts. Black ink only, print-ready.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: AC_DEFAULT_TITLE,
  pageTitleHelp:
    'Leave as “Advice for the Retiree” and each set gets its own heading (“Words of Wisdom”, “Tips for the Next Chapter”…), named for the retiree when you add a name below. Or type your own.',
  prefetch: adviceCardsPrefetch,
  validateConfig: validateAcConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <text x="32" y="6" font-family="serif" font-weight="700" font-size="4.2" text-anchor="middle" fill="currentColor">Advice for the Retiree</text>
    <g stroke="currentColor" stroke-width="0.5" fill="none">
      <rect x="5" y="9" width="25" height="13.5" rx="1.5"/>
      <rect x="34" y="9" width="25" height="13.5" rx="1.5"/>
      <rect x="5" y="25" width="25" height="13.5" rx="1.5"/>
      <rect x="34" y="25" width="25" height="13.5" rx="1.5"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" stroke-dasharray="1.2 0.9" opacity="0.6">
      <path d="M32 9v29.5M5 23.75h54"/>
    </g>
    <g font-family="serif" font-style="italic" font-size="2.2" fill="currentColor">
      <text x="7" y="12.6">Always say yes to…</text>
      <text x="36" y="12.6">Places to visit:</text>
      <text x="7" y="28.6">Don’t forget to…</text>
      <text x="36" y="28.6">Treat yourself to…</text>
    </g>
    <g stroke="currentColor" stroke-width="0.35" opacity="0.5">
      <path d="M7 16h21M7 19h21M39 16h18M39 19h18M7 32h21M7 35h21M36 32h21M36 35h21"/>
    </g>
    <g font-family="serif" font-size="1.8" fill="currentColor" opacity="0.6">
      <text x="36" y="16">1.</text><text x="36" y="19">2.</text>
    </g>
  </svg>`,
  configSchema: AC_CONFIG_SCHEMA,
  generate,
}
