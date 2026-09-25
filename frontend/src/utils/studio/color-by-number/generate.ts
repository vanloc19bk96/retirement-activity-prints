import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, contentBox, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { sgVariantKey } from '../stained-glass/content'
import type { Bounds } from '../stained-glass/geometry'
import { CBN_CONFIG_SCHEMA } from './config'
import {
  CBN_BUILD_FAILED_MESSAGE,
  CBN_DEFAULT_TITLE,
  CBN_PAGE_TOO_SMALL_MESSAGE,
  CBN_TEMPLATE_KEY,
  cbnDesignDrawing,
  cbnDesignEntry,
  cbnInstruction,
  cbnLevelSpec,
  cbnPageLabel,
  parseCbnBook,
  parseCbnKeyStyle,
  parseCbnLevel,
  parseCbnTheme,
  pickCbnDesign,
  type CbnDesign,
  type CbnLevelSpec,
} from './content'
import { buildCbnKey, buildCbnScene } from './draw'
import { checkCbnDrawnPage, runCbnKdpPreflight } from './kdp-preflight'
import { boxToBounds, cbnKeyLayout, cbnLayoutInBody, cbnPanelFits } from './layout'
import { CBN_INK_WIDTH, cbnDrawingScaleFloor, paintScene, type CbnArtResult } from './paint'
import { CBN_PIECE_HINTS } from './palette'
import { colorByNumberPrefetch, parseCbnRemoteData } from './prefetch'
import { buildScene } from './scene'

/** One ledger for the whole template: a seller's next book opens with other subjects. */
const VARIETY_KEY = studioVarietyKey(CBN_TEMPLATE_KEY, 'subjects')
/** About two thirds of the library: recent subjects wait, but a theme never runs dry. */
const RECENT_WINDOW = 24
/** The drawings this seller printed (`subject:version`); a few books' worth. */
const ART_VARIETY_KEY = studioVarietyKey(CBN_TEMPLATE_KEY, 'art')
const RECENT_ART_WINDOW = 200
/** Designs tried before the page gives up and says so. */
const ATTEMPTS = 10
/**
 * Scenes built for one design (same subject, drawing and composition) before
 * it is set aside: each deal lays the scenery out afresh, and sets the subject
 * a little larger or smaller, since a pinch between two of its parts that is
 * too small to number at one size is a space at another and ink at a third.
 */
const DEAL_SIZES = [1, 1.14, 0.9] as const

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
 * One Color by Number page.
 *
 * Chosen, built, measured, checked. The design (subject, drawing, mood,
 * scene) is dealt against what the book and this seller have already
 * printed; the scene is built, printed to a grid and every space measured,
 * slivers repaired or refused; each space is colored from the mood and
 * numbered; then the whole page must pass the preflight (a real subject, big
 * enough; a complete, consistent key of six to eight colors; every number
 * readable and clear of the lines; not a page the book already has) and the
 * drawn check. A design that fails anywhere is dropped and another dealt, and
 * if none passes the page says so plainly instead of printing a broken scene.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = cbnLevelSpec(parseCbnLevel(config.level))
  const theme = parseCbnTheme(config.theme)
  const keyStyle = parseCbnKeyStyle(config.keyStyle)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const ownerSalt = resolveOwnerSalt(ctx)
  const instruction = cbnInstruction(config, ownerSalt)
  const tag: StudioTag = { templateKey: CBN_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const layout = cbnLayoutInBody(header.body, header.objects.length > 0, font, keyStyle)
  if (!cbnPanelFits(layout.panel)) return fail(CBN_PAGE_TOO_SMALL_MESSAGE)

  const book = parseCbnBook(parseCbnRemoteData(ctx.remoteData).bookLabels)
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentArt = studioAvoidList(ART_VARIETY_KEY, RECENT_ART_WINDOW)
  const exclude = new Set<string>()
  const excludeArt = new Set<string>()
  const failures = new Map<string, number>()
  const box = boxToBounds(layout.panel)

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const design: CbnDesign | null = pickCbnDesign({
      theme,
      level,
      seed: ctx.seed,
      ownerSalt,
      aspect: layout.panel.height / layout.panel.width,
      span: Math.min(layout.panel.width, layout.panel.height) / DPI,
      book,
      recent,
      recentArt,
      exclude,
      excludeArt,
      attempt,
    })
    if (!design) break
    const art = buildCbnArt({ design, level, box, seed: ctx.seed, ownerSalt, attempt })
    const artKey = `${design.subject.id}:${sgVariantKey(design.subject, design.variant)}`
    if (!art.ok) {
      // A drawing that will not number cleanly is set aside; a subject that fails twice, too.
      excludeArt.add(artKey)
      const count = (failures.get(design.subject.id) ?? 0) + 1
      failures.set(design.subject.id, count)
      if (count >= 2) exclude.add(design.subject.id)
      continue
    }
    // The page is judged, and labelled, as drawn: a part that found no room is not in it.
    const drawn: CbnDesign = { ...design, composition: art.composition }
    if (!runCbnKdpPreflight({ design: drawn, art, level, book }).ok) {
      excludeArt.add(artKey)
      continue
    }

    const label = cbnPageLabel(cbnDesignEntry(drawn))
    const scene = buildCbnScene({
      runs: art.runs,
      labels: art.labels,
      box: layout.panel,
      tag,
      label,
      canonical: `${label}|${level.value}|${ctx.seed}`,
    })
    const keyLayout = cbnKeyLayout(layout.keyBand, art.legend, font, keyStyle)
    const key = buildCbnKey({ layout: keyLayout, tag, fontFamily: font, filled: keyStyle === 'swatches' })
    if (checkCbnDrawnPage({ scene, key, box: layout.panel, keyBox: keyLayout.box, legend: art.legend }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [design.subject.id])
    rememberStudioContent(ART_VARIETY_KEY, [artKey])
    return [{ pageRole: 'single', objects: [...header.objects, scene, key] }]
  }
  return fail(CBN_BUILD_FAILED_MESSAGE)
}

/** Build and paint the design's scene, dealing it again (see `DEAL_SIZES`) while a build will not number cleanly. */
export function buildCbnArt(options: {
  design: CbnDesign
  level: CbnLevelSpec
  box: Bounds
  seed: number
  ownerSalt: string
  attempt: number
}): CbnArtResult {
  const { design, level, box, seed, ownerSalt, attempt } = options
  const drawing = cbnDesignDrawing(design)
  const hint = CBN_PIECE_HINTS[design.subject.id]
  const pieceHint = hint ? (index: number) => hint(index, drawing.pieces.length, design.variant.knobs) : undefined
  const minScale = cbnDrawingScaleFloor(drawing, level.rules, `${design.subject.id}:${sgVariantKey(design.subject, design.variant)}`)
  let art: CbnArtResult = { ok: false, reason: 'Not built.' }
  for (let deal = 0; deal < DEAL_SIZES.length && !art.ok; deal++) {
    const rng = createRngFromSeedInput({
      ownerSalt,
      templateKey: CBN_TEMPLATE_KEY,
      configHash: `scene:${level.value}`,
      pageNonce: seed,
      stream: `${attempt}.${deal}`,
    })
    const scene = buildScene({
      box,
      composition: design.composition,
      drawing,
      subject: design.subject,
      rng,
      fill: level.fill * DEAL_SIZES[deal]!,
      frameInk: CBN_INK_WIDTH.frame,
      minScale,
    })
    if (!scene.ok) {
      art = { ok: false, reason: scene.reason }
      continue
    }
    art = paintScene({ scene, box, rules: level.rules, palette: design.palette, subjectId: design.subject.id, pieceHint, spaces: level.spaces })
  }
  return art
}

export const colorByNumberTemplate: StudioTemplateDefinition = {
  key: CBN_TEMPLATE_KEY,
  label: 'Color by Number: Retirement Scenes',
  category: 'spatial',
  description:
    'A relaxing color-by-number page: a retirement scene — a porch rocker by the window, a motorhome in the hills, a sailboat at golden hour — divided into numbered spaces, with a 6–8 color key below. Works in black-and-white books: every color is named, with a box to try each pencil.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: CBN_DEFAULT_TITLE,
  prefetch: colorByNumberPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <rect x="13" y="3" width="38" height="27" rx="2.5" stroke-width="1.3"/>
      <g stroke-width="0.8">
        <circle cx="21" cy="10" r="3.2"/>
        <path d="M13 21q9-5 19-1t19-2M13 25.5q12-4 38-1"/>
        <path d="M33 26v-7h10v7M31.5 19l6.5-5 6.5 5"/>
      </g>
      <g stroke-width="0.7">
        <circle cx="17" cy="35.5" r="2"/><rect x="20.5" y="34" width="4" height="3" rx="0.6"/>
        <circle cx="31" cy="35.5" r="2"/><rect x="34.5" y="34" width="4" height="3" rx="0.6"/>
        <circle cx="45" cy="35.5" r="2"/><rect x="48.5" y="34" width="4" height="3" rx="0.6"/>
      </g>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="3.2" text-anchor="middle">
      <text x="21" y="11.1">1</text><text x="24" y="27.6">2</text><text x="38" y="24.2">3</text>
      <text x="17" y="36.6">1</text><text x="31" y="36.6">2</text><text x="45" y="36.6">3</text>
    </g>
  </svg>`,
  configSchema: CBN_CONFIG_SCHEMA,
  generate,
}
