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
import { wrapSafeWidth, wrapTextToWidth } from '../studio-text-metrics'
import { WW_CONFIG_SCHEMA, validateWwConfig } from './config'
import {
  WW_BUILD_FAILED_MESSAGE,
  WW_DEFAULT_TITLE,
  WW_FRAME_STYLES,
  WW_LABEL_PLACEMENTS,
  WW_MOTIFS,
  WW_PAGE_TOO_SMALL_MESSAGE,
  WW_TEMPLATE_KEY,
  dealPrompts,
  headingText,
  introText,
  parseWwAudience,
  parseWwName,
  parseWwPages,
  pickFresh,
  slug,
  wwHeadingsFor,
  wwIntrosFor,
  wwLabel,
  wwPromptsFor,
  wwSignoffsFor,
  type WwMemory,
} from './content'
import { drawBox, drawOrnament, type DrawContext } from './draw'
import { runWwKdpPreflight } from './kdp-preflight'
import {
  boxInnerWidth,
  cellWidth,
  chooseLabelFont,
  fittingSignoffs,
  headingFits,
  ornamentStrip,
  ornamentTop,
  plainSpec,
  planWellWishes,
  wwContentBox,
  type WwPageHead,
  type WwStyle,
} from './layout'
import { parseWwRemoteData, wellWishesPrefetch } from './prefetch'

/** An intro longer than this many lines eats writing room; it is never printed. */
const INTRO_MAX_LINES = 2
/** Seller memory windows: about two sets' worth of looks, and of prompts. */
const RECENT_DESIGN = 14
const RECENT_PROMPTS = 36

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const header = drawHeader(wwContentBox(ctx), config, tag, '')
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
 * The book's earlier sets stamp one combined look label per set
 * (`d:frame/placement/signoff`); unpack it so each part can be avoided alone.
 */
function expandBookLabels(labels: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const label of labels) {
    if (!label.startsWith('d:')) {
      out.add(label)
      continue
    }
    const [frame, placement, signoff] = label.slice(2).split('/')
    if (frame) out.add(`f:${frame}`)
    if (placement) out.add(`l:${placement}`)
    if (signoff) out.add(`s:${signoff}`)
  }
  return out
}

/**
 * Wrapped by real glyph widths, so the header reserves exactly the lines it
 * prints and the intro never re-wraps into the boxes. A two-line intro is
 * balanced — the narrowest measure that still takes two lines — so it never
 * ends on a lone word or two.
 */
function wrapIntro(text: string, width: number, font: string): string {
  const spec = plainSpec(font)
  const wrap = (measure: number) => wrapTextToWidth(text, STUDIO_INSTRUCTION_SIZE, measure, spec)
  const full = wrapSafeWidth(width, spec)
  const lines = wrap(full)
  if (lines.length !== 2) return lines.join('\n')
  let lo = full / 2
  let hi = full
  while (hi - lo > 4) {
    const measure = (lo + hi) / 2
    if (wrap(measure).length === 2) hi = measure
    else lo = measure
  }
  return wrap(hi).join('\n')
}

/**
 * A set of signature pages: a warm heading, one short line of how-to, then
 * framed boxes — a prompt, writing lines and a signature line in each.
 *
 * Chosen first, measured second, checked third. The look (heading, intro,
 * frame, label placement, ornament, sign-off) is picked by seed away from what
 * this book and this seller printed last; the pages are planned from the trim
 * at handwriting sizes; prompts are dealt one per box; and the preflight
 * re-proves every page before anything is returned. No answer page: the
 * messages are written by hand, after printing.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const name = parseWwName(config.retireeName)
  const audience = parseWwAudience(config.audience)
  const pageCount = parseWwPages(config.pages)
  const tag: StudioTag = { templateKey: WW_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]
  const content = wwContentBox(ctx)

  const designKey = studioVarietyKey(WW_TEMPLATE_KEY, audience, 'design')
  const promptKey = studioVarietyKey(WW_TEMPLATE_KEY, audience, 'prompts')
  const book = expandBookLabels(parseWwRemoteData(ctx.remoteData).bookLabels)
  const memory: WwMemory = {
    book,
    recent: new Set([...studioAvoidList(designKey, RECENT_DESIGN), ...studioAvoidList(promptKey, RECENT_PROMPTS)]),
  }
  const pick = (salt: string) => createRng(deriveSeed(ctx.seed, salt))

  // Heading: the seller's own, or — left as the default — one of ours.
  const typedTitle = String(config.title ?? '').trim()
  const autoTitle = typedTitle === WW_DEFAULT_TITLE
  let titles: string[] = Array.from({ length: pageCount }, () => typedTitle)
  let headingId = ''
  if (typedTitle && autoTitle) {
    const candidates = wwHeadingsFor(audience).filter(
      (h) => headingFits(h.plain, content.width, font) && headingFits(h.more, content.width, font),
    )
    if (candidates.length === 0) return fail(WW_PAGE_TOO_SMALL_MESSAGE)
    const heading = pickFresh(pick('heading'), candidates, (h) => wwLabel.heading(h.id), memory)
    const named = headingText(heading, name)
    const first = headingFits(named, content.width, font) ? named : heading.plain
    titles = titles.map((_, index) => (index === 0 ? first : heading.more))
    headingId = heading.id
  }

  // Intro: one or two lines, never more.
  let instruction = ''
  let introId = ''
  if (config.showInstructions !== false) {
    const fitsIntro = (text: string) =>
      estimateWrappedLines(wrapIntro(text, content.width, font), STUDIO_INSTRUCTION_SIZE, content.width) <= INTRO_MAX_LINES
    const candidates = wwIntrosFor(audience).filter((i) => fitsIntro(i.plain))
    if (candidates.length > 0) {
      const intro = pickFresh(pick('intro'), candidates, (i) => wwLabel.intro(i.id), memory)
      const named = introText(intro, name)
      instruction = wrapIntro(fitsIntro(named) ? named : intro.plain, content.width, font)
      introId = intro.id
    }
  }

  const style: WwStyle = {
    frame: pickFresh(pick('frame'), WW_FRAME_STYLES, wwLabel.frame, memory),
    placement: pickFresh(pick('placement'), WW_LABEL_PLACEMENTS, wwLabel.placement, memory),
  }
  const motif = pickFresh(pick('motif'), WW_MOTIFS, wwLabel.motif, memory)

  const innerWidth = boxInnerWidth(cellWidth(content.width), style)
  const { labelFont, pool } = chooseLabelFont(
    wwPromptsFor(audience).map((p) => p.text),
    innerWidth,
    style,
    font,
  )
  const signoffs = fittingSignoffs(wwSignoffsFor(audience), innerWidth, labelFont, font)
  if (pool.length === 0 || signoffs.length === 0) return fail(WW_PAGE_TOO_SMALL_MESSAGE)
  const signoff = pickFresh(pick('signoff'), signoffs, wwLabel.signoff, memory)

  const heads: WwPageHead[] = titles.map((title, index) => ({ title, instruction: index === 0 ? instruction : '' }))
  const plan = planWellWishes(ctx, config, heads, style, labelFont)
  if (!plan) return fail(WW_PAGE_TOO_SMALL_MESSAGE)

  const prompts = dealPrompts(
    pick('prompts'),
    pool,
    plan.pages.map((p) => p.boxes.length),
    memory,
  )
  if (!prompts) return fail(WW_BUILD_FAILED_MESSAGE)

  const preflight = runWwKdpPreflight({
    page: ctx,
    plan,
    pages: pageCount,
    style,
    prompts,
    signoff,
    titles,
    generatedTitles: autoTitle,
    font,
  })
  if (!preflight.ok) return fail(preflight.errors[0] ?? WW_BUILD_FAILED_MESSAGE)

  const designLabels = [
    ...(headingId ? [wwLabel.heading(headingId)] : []),
    ...(introId ? [wwLabel.intro(introId)] : []),
    wwLabel.frame(style.frame),
    wwLabel.placement(style.placement),
    wwLabel.signoff(signoff),
    ...(heads[0]!.title || heads[0]!.instruction ? [wwLabel.motif(motif)] : []),
  ]
  rememberStudioContent(designKey, designLabels)
  rememberStudioContent(promptKey, prompts.flat().map(wwLabel.prompt))

  const designLabel = `d:${style.frame}/${style.placement}/${slug(signoff)}`
  return plan.pages.map((pagePlan, index) => {
    const head = heads[index]!
    const header = drawHeader(content, { ...config, title: head.title }, tag, head.instruction)
    // Stamp what the header printed, so a later set in the book can steer clear.
    const objects: StudioFabricObject[] = header.objects.map((obj) => {
      const label = isStudioHeaderTitle(obj) ? (headingId ? wwLabel.heading(headingId) : '') : introId ? wwLabel.intro(introId) : ''
      return label && index === 0 ? { ...obj, data: { ...obj.data, [STUDIO_CONTENT_LABEL_KEY]: label } } : obj
    })
    const draw: DrawContext = { objects, tag, font }
    const headerHeight = header.body.top - content.top
    if (ornamentStrip(headerHeight) > 0) {
      drawOrnament(draw, { column: content, top: ornamentTop(header.body.top), motif, label: wwLabel.motif(motif) })
    }
    pagePlan.boxes.forEach((box, b) => {
      const prompt = prompts[index]![b]!
      drawBox(draw, {
        box,
        style,
        labelFont: plan.labelFont,
        prompt,
        signoff,
        designLabel: index === 0 && b === 0 ? designLabel : undefined,
        promptLabel: wwLabel.prompt(prompt),
      })
    })
    return { pageRole: 'single', objects }
  })
}

export const wellWishesTemplate: StudioTemplateDefinition = {
  key: WW_TEMPLATE_KEY,
  label: 'Well Wishes & Signatures',
  category: 'word',
  description:
    'A keepsake signature section for a retirement or farewell book: framed boxes where coworkers, friends and family write a wish or a favorite memory and sign their name. Each box has a gentle prompt, roomy writing lines and a signature line, sized to your trim for real handwriting. Every set gets its own warm heading, frame style and prompts — black ink only, print-ready.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: WW_DEFAULT_TITLE,
  pageTitleHelp:
    'Leave as “Well Wishes” and each set gets its own warm heading — “Retirement Wishes”, “Notes & Good Wishes”… — named for the retiree when you add a name below. Or type your own.',
  prefetch: wellWishesPrefetch,
  validateConfig: validateWwConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <text x="32" y="6" font-family="serif" font-weight="700" font-size="4.2" text-anchor="middle" fill="currentColor">Well Wishes</text>
    <g stroke="currentColor" stroke-width="0.5" fill="none">
      <path d="M21 9h8M35 9h8"/>
      <path d="M32 7.4l0.5 1.1 1.1 0.5-1.1 0.5-0.5 1.1-0.5-1.1-1.1-0.5 1.1-0.5z"/>
      <rect x="5" y="13" width="26" height="24" rx="2"/>
      <rect x="33" y="13" width="26" height="24" rx="2"/>
    </g>
    <g font-family="serif" font-style="italic" font-size="2.6" fill="currentColor">
      <text x="7.5" y="17.4">My wish for you</text>
      <text x="35.5" y="17.4">A favorite memory</text>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.5">
      <path d="M7.5 22h21M7.5 26h21M7.5 30h21M35.5 22h21M35.5 26h21M35.5 30h21"/>
    </g>
    <g font-family="serif" font-size="2.4" fill="currentColor">
      <text x="7.5" y="34.2">From</text>
      <text x="35.5" y="34.2">From</text>
    </g>
    <g stroke="currentColor" stroke-width="0.5">
      <path d="M14.5 34h14M42.5 34h14"/>
    </g>
  </svg>`,
  configSchema: WW_CONFIG_SCHEMA,
  generate,
}
