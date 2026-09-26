import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT, STUDIO_GAME_TITLE_PREFIX } from '@/constants/studio.constants'
import { boxCenterX } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { createRng, deriveSeed } from '../studio-rng'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { CR_CONFIG_SCHEMA, validateCrConfig } from './config'
import {
  CR_BLANK_DATE_LABEL,
  CR_BUILD_FAILED_MESSAGE,
  CR_DEFAULT_TITLE,
  CR_EMBLEMS,
  CR_FRAMES,
  CR_NAME_STYLES,
  CR_PAGE_TOO_SMALL_MESSAGE,
  CR_SEALS,
  CR_TEMPLATE_KEY,
  citationText,
  crCitationsFor,
  crDateLabelsFor,
  crDateYear,
  crHeadingsFor,
  crLabel,
  crLeadsFor,
  crPromotionsFor,
  crServiceFor,
  crSignLabelsFor,
  crTitlesFor,
  parseCrCustomTitle,
  parseCrDate,
  parseCrName,
  parseCrPlace,
  parseCrTone,
  parseCrYears,
  pickFresh,
  type CrCitation,
  type CrMemory,
  type CrSeal,
} from './content'
import {
  drawDivider,
  drawEmblem,
  drawFrame,
  drawNameLine,
  drawPromotionArms,
  drawSignRow,
  drawText,
  type DrawContext,
} from './draw'
import { runCrKdpPreflight } from './kdp-preflight'
import {
  CITATION_LINES,
  capsLineFits,
  citationLines,
  crPageFits,
  crSafeBox,
  crTextArea,
  headingFitsOneLine,
  overFits,
  planCertificate,
  signLabelFits,
  type CrContent,
  type CrPlan,
} from './layout'
import { parseCrRemoteData, retirementCertificatePrefetch } from './prefetch'

/** Seller memory windows: a few certificates' worth of looks, and of titles. */
const RECENT_DESIGN = 24
const RECENT_TITLES = 40

const GAME_TITLE_RE = new RegExp(`^${STUDIO_GAME_TITLE_PREFIX}\\s+\\d+$`)

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const safe = crSafeBox(ctx)
  return {
    pageRole: 'single',
    objects: [
      buildText(
        {
          left: boxCenterX(safe),
          top: safe.top + safe.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
          fontSize: STUDIO_BODY_SIZE - 4,
          width: safe.width * 0.85,
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
 * An earlier certificate stamps one combined look label
 * (`d:frame/emblem/seal/name`); unpack it so each part can be avoided alone.
 */
function expandBookLabels(labels: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const label of labels) {
    if (!label.startsWith('d:')) {
      out.add(label)
      continue
    }
    const [frame, emblem, seal, name] = label.slice(2).split('/')
    if (frame) out.add(`f:${frame}`)
    if (emblem) out.add(`e:${emblem}`)
    if (seal) out.add(`s:${seal}`)
    if (name) out.add(`n:${name}`)
  }
  return out
}

/**
 * The heading the certificate prints. Left as the default — or given a
 * "Game N" number by a whole-book run, which a certificate never wears — it
 * is one of ours; typed, it is printed as typed; switched off, there is none.
 */
function headingMode(config: StudioConfig): { auto: boolean; typed: string } {
  const typed = config.showTitle === false ? '' : String(config.title ?? '').trim()
  return { auto: typed === CR_DEFAULT_TITLE || GAME_TITLE_RE.test(typed), typed }
}

/**
 * One Certificate of Retirement.
 *
 * Chosen first, measured second, checked third. The wording (heading, lead,
 * citation, service phrase, promotion line, new title) and the look (frame,
 * emblem, seal, name style) are picked by seed, away from what this book and
 * this seller printed last. The stack is then measured and fitted to the trim;
 * if it cannot fit, it steps down to a simpler certificate (no emblem, the
 * shortest citation, no seal) before giving up. The preflight re-proves the
 * page before anything is returned. No answer page.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const tone = parseCrTone(config.tone)
  const name = parseCrName(config.retireeName)
  const years = parseCrYears(config.yearsOfService)
  const date = parseCrDate(config.retirementDate)
  const place = parseCrPlace(config.workplace)
  const customTitle = parseCrCustomTitle(config.promotedTo)
  const tag: StudioTag = { templateKey: CR_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]
  if (!crPageFits(ctx)) return fail(CR_PAGE_TOO_SMALL_MESSAGE)
  const area = crTextArea(ctx)

  const designKey = studioVarietyKey(CR_TEMPLATE_KEY, tone, 'design')
  const titleKey = studioVarietyKey(CR_TEMPLATE_KEY, tone, 'titles')
  const memory: CrMemory = {
    book: expandBookLabels(parseCrRemoteData(ctx.remoteData).bookLabels),
    recent: new Set([...studioAvoidList(designKey, RECENT_DESIGN), ...studioAvoidList(titleKey, RECENT_TITLES)]),
  }
  const pick = (salt: string) => createRng(deriveSeed(ctx.seed, salt))

  // Heading.
  const { auto, typed } = headingMode(config)
  let over = ''
  let heading = typed
  let headingId = ''
  if (auto) {
    const all = crHeadingsFor(tone)
    const fitting = all.filter((h) => (!h.over || overFits(h.over, area, font)) && headingFitsOneLine(h.main, area, font))
    const pool = fitting.length > 0 ? fitting : all.filter((h) => !h.over || overFits(h.over, area, font))
    const chosen = pickFresh(pick('heading'), pool.length > 0 ? pool : all, (h) => crLabel.heading(h.id), memory)
    over = chosen.over ?? ''
    heading = chosen.main
    headingId = chosen.id
  }

  // Wording.
  const lead = pickFresh(pick('lead'), crLeadsFor(tone), (l) => crLabel.lead(l.id), memory)
  const service = pickFresh(pick('service'), crServiceFor(tone), (s) => `v:${s.id}`, memory)
  const citations = crCitationsFor(tone, lead.kind)
  const sayCitation = (c: CrCitation) => citationText(c, service, years, place)
  // Short enough to stay a few lines on this trim, with this workplace; else the shortest.
  const shortest = [...citations].sort((a, b) => sayCitation(a).length - sayCitation(b).length)[0]!
  const brief = citations.filter((c) => citationLines(sayCitation(c), area, font) <= CITATION_LINES)
  const citation = pickFresh(pick('citation'), brief.length > 0 ? brief : [shortest], (c) => crLabel.citation(c.id), memory)
  const promotions = crPromotionsFor(tone).filter((p) => capsLineFits(p.text, area, font))
  if (promotions.length === 0) return fail(CR_PAGE_TOO_SMALL_MESSAGE)
  const promotion = pickFresh(pick('promotion'), promotions, (p) => crLabel.promotion(p.id), memory)
  const titles = crTitlesFor(tone)
  const title = customTitle || pickFresh(pick('title'), titles, crLabel.title, memory)
  // Labels short enough to keep the two lines side by side on this trim.
  const roomy = <T extends { text: string }>(items: readonly T[]) => {
    const fitting = items.filter((item) => signLabelFits(item.text, area, font))
    return fitting.length > 0 ? fitting : items
  }
  const signLabel = pick('sign').pick(roomy(crSignLabelsFor(tone))).text
  const dateLabel = date ? pick('date').pick(roomy(crDateLabelsFor(tone))).text : CR_BLANK_DATE_LABEL

  // Look.
  const frame = pickFresh(pick('frame'), CR_FRAMES, crLabel.frame, memory)
  const emblem = pickFresh(pick('emblem'), CR_EMBLEMS, crLabel.emblem, memory)
  const wantedSeal = pickFresh(pick('seal'), CR_SEALS, crLabel.seal, memory)
  const nameStyle = pickFresh(pick('name-style'), CR_NAME_STYLES, (s) => `n:${s}`, memory)

  const base: CrContent = {
    emblem: true,
    over,
    heading,
    lead: lead.text,
    name,
    nameStyle,
    citation: sayCitation(citation),
    promotion: promotion.text,
    title,
    signLabel,
    dateLabel,
    date,
    seal: wantedSeal !== 'none',
  }

  // A long name, workplace or title on a small trim steps down to a simpler certificate.
  const attempts: CrContent[] = [
    base,
    { ...base, emblem: false },
    { ...base, emblem: false, citation: sayCitation(shortest) },
    { ...base, emblem: false, citation: sayCitation(shortest), seal: false, over: '' },
  ]
  let plan: CrPlan | null = null
  let content = base
  for (const attempt of attempts) {
    plan = planCertificate(ctx, attempt, font)
    if (plan) {
      content = attempt
      break
    }
  }
  if (!plan) return fail(CR_BUILD_FAILED_MESSAGE)

  const citationId = content.citation === base.citation ? citation.id : shortest.id
  const seal: CrSeal = plan.sign.arrangement === 'seal' ? wantedSeal : 'none'
  const generatedTitle = customTitle ? '' : title
  const titleLabel = crLabel.title(title)
  const repeatsBook =
    Boolean(generatedTitle) && memory.book.has(titleLabel) && titles.some((t) => !memory.book.has(crLabel.title(t)))

  const preflight = runCrKdpPreflight({ page: ctx, plan, generatedTitle, repeatsBook })
  if (!preflight.ok) return fail(preflight.errors[0] ?? CR_BUILD_FAILED_MESSAGE)

  rememberStudioContent(designKey, [
    ...(headingId ? [crLabel.heading(headingId)] : []),
    crLabel.lead(lead.id),
    crLabel.citation(citationId),
    `v:${service.id}`,
    crLabel.promotion(promotion.id),
    crLabel.frame(frame),
    ...(content.emblem ? [crLabel.emblem(emblem)] : []),
    crLabel.seal(seal),
    `n:${nameStyle}`,
  ])
  if (generatedTitle) rememberStudioContent(titleKey, [titleLabel])

  const objects: StudioFabricObject[] = []
  const draw: DrawContext = { objects, tag, font }
  const cx = boxCenterX(plan.area)
  drawFrame(draw, plan.frame, frame, `d:${frame}/${content.emblem ? emblem : ''}/${seal}/${nameStyle}`)
  for (const block of plan.blocks) {
    const text = block.text
    switch (block.kind) {
      case 'emblem':
        drawEmblem(draw, block, plan.area, emblem, crLabel.emblem(emblem))
        break
      case 'divider':
        drawDivider(draw, block)
        break
      case 'nameLine':
        drawNameLine(draw, block)
        break
      case 'sign':
        drawSignRow(draw, plan, seal, crDateYear(date))
        break
      case 'promotion':
        drawPromotionArms(draw, block, plan.area)
        drawText(draw, text!, cx, block.box.top, crLabel.promotion(promotion.id))
        break
      case 'heading':
        drawText(draw, text!, cx, block.box.top, headingId ? crLabel.heading(headingId) : undefined)
        break
      case 'lead':
        drawText(draw, text!, cx, block.box.top, crLabel.lead(lead.id))
        break
      case 'citation':
        drawText(draw, text!, cx, block.box.top, crLabel.citation(citationId))
        break
      case 'title':
        drawText(draw, text!, cx, block.box.top, titleLabel)
        break
      default:
        drawText(draw, text!, cx, block.box.top)
    }
  }
  return [{ pageRole: 'single', objects }]
}

export const retirementCertificateTemplate: StudioTemplateDefinition = {
  key: CR_TEMPLATE_KEY,
  label: 'Certificate of Retirement',
  category: 'word',
  description:
    'A framed, gift-worthy certificate for a retirement or farewell book: the retiree’s name, their years of service and an “Officially promoted to…” title such as “Chief Leisure Officer”, with lines to sign and date. Every detail is optional — leave one blank and the certificate still reads complete, with a line to write it in by hand. Each certificate gets its own wording, frame and emblem — black ink only, print-ready.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: CR_DEFAULT_TITLE,
  pageTitleHelp:
    'Leave as “Certificate of Retirement” and each certificate gets its own heading — “Official License to Retire”, “Certificate of Well-Earned Freedom”… Or type your own.',
  hidesInstructionsToggle: true,
  prefetch: retirementCertificatePrefetch,
  validateConfig: validateCrConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" fill="none">
      <rect x="8" y="1.5" width="48" height="37" stroke-width="1"/>
      <rect x="10" y="3.5" width="44" height="33" stroke-width="0.4"/>
      <path d="M29.5 8.2a2.5 2.5 0 0 1 5 0M28 8.2h8" stroke-width="0.4"/>
      <path d="M22 18.6h20" stroke-width="0.3"/>
      <path d="M15 32.5h11M38 32.5h11" stroke-width="0.4"/>
      <circle cx="32" cy="32" r="3.2" stroke-width="0.4"/>
      <circle cx="32" cy="32" r="2.2" stroke-width="0.3"/>
    </g>
    <g font-family="serif" fill="currentColor" text-anchor="middle">
      <text x="32" y="12.6" font-weight="700" font-size="3.4">Certificate of Retirement</text>
      <text x="32" y="17.4" font-style="italic" font-size="4.2">Linda Moore</text>
      <text x="32" y="21.8" font-size="1.7">after 32 years of dedicated service</text>
      <text x="32" y="25.2" font-size="1.5" letter-spacing="0.2">OFFICIALLY PROMOTED TO</text>
      <text x="32" y="28.6" font-weight="700" font-size="2.8">Chief Leisure Officer</text>
    </g>
  </svg>`,
  configSchema: CR_CONFIG_SCHEMA,
  generate,
}
