import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, contentBox, drawHeader, type Box } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import type { Bounds } from '../stained-glass/geometry'
import { SD_CONFIG_SCHEMA } from './config'
import {
  SD_BUILD_FAILED_MESSAGE,
  SD_DEFAULT_TITLE,
  SD_PAGE_TOO_SMALL_MESSAGE,
  SD_TEMPLATE_KEY,
  parseSdBook,
  parseSdGroup,
  parseSdLevel,
  sdInstruction,
  sdLevelSpec,
  sdPageLabel,
} from './content'
import { SD_MARK_OVERHANG, chooseDifferences, sdPairLines, type SdDifference } from './differences'
import { buildSdLegend, buildSdPicture, buildSdTally, layoutSdLegend } from './draw'
import { checkSdDrawnPage, runSdKdpPreflight } from './kdp-preflight'
import { SD_HEADER_AIR, SD_PANEL_GAP, SD_TALLY_AIR, SD_TALLY_H, sdPanelSize, sdPlacePanels, type SdPanelSize } from './layout'
import { parseSdRemoteData, spotTheDifferencePrefetch } from './prefetch'
import type { SdLines } from './render'
import { dealScene, sdRecipeById } from './scenes'
import type { SdScene } from './scene'
import { pickSdRecipe, sdCanonical, sdKindsSignature, sdSceneEntry, sdSimilarity } from './variety'

/** One ledger for the whole template: a seller's next book opens with other scenes. */
const VARIETY_KEY = studioVarietyKey(SD_TEMPLATE_KEY, 'scenes')
/** About half the scenes: recent ones wait, but a group never runs dry. */
const RECENT_WINDOW = 6
/** The scenes (by what is in them) this seller printed; a few books' worth. */
const SCENE_KEY = studioVarietyKey(SD_TEMPLATE_KEY, 'kinds')
const RECENT_SCENE_WINDOW = 200
/** Scenes tried before the page gives up and says so. */
const ATTEMPTS = 16
/** Deals of one scene per attempt; the one least like the book's pages is kept. */
const DEALS = 3
/** A scene this like a page the book has is dealt again (if a deal left will do better). */
const SIMILAR_ENOUGH = 0.5
/** Fresh choices of differences when the full check faults one. */
const RECHOOSE = 2

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const header = drawHeader(contentBox(ctx), config, tag, '')
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

/** The puzzle page: heading and instruction, the two pictures, the tick row. */
function puzzlePage(options: {
  ctx: StudioGenerateContext
  config: StudioConfig
  tag: StudioTag
  size: SdPanelSize
  lines: { a: SdLines; b: SdLines }
  differences: readonly SdDifference[]
  instruction: string
  label: string
  canonical: string
  font: string
}): StudioFabricObject[] {
  const { ctx, config, tag, size, lines, differences, instruction, label, canonical, font } = options
  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const layout = sdPlacePanels(header.body, size, header.objects.length > 0, SD_TALLY_AIR + SD_TALLY_H)
  const marks = differences.map((d) => d.mark)
  const tallyBox: Box = { left: layout.foot.left, top: layout.foot.top + SD_TALLY_AIR, width: layout.foot.width, height: SD_TALLY_H }
  return [
    ...header.objects,
    buildSdPicture({ lines: lines.a, box: layout.top, marks, tag, which: 'top', label, canonical }),
    buildSdPicture({ lines: lines.b, box: layout.bottom, marks, tag, which: 'bottom', canonical }),
    buildSdTally({ count: differences.length, box: tallyBox, tag, fontFamily: font }),
  ]
}

/**
 * The answer page: the same two pictures at the same size, every difference
 * ringed and numbered, and under them a short list of what changed. No
 * instruction â€” a reader at the answers has already been told the rules.
 */
function answerPage(options: {
  ctx: StudioGenerateContext
  config: StudioConfig
  tag: StudioTag
  size: SdPanelSize
  lines: { a: SdLines; b: SdLines }
  differences: readonly SdDifference[]
  canonical: string
  font: string
}): StudioFabricObject[] {
  const { ctx, config, tag, size, lines, differences, canonical, font } = options
  const header = drawHeader(contentBox(ctx), config, tag, '')
  const headed = header.objects.length > 0
  const labels = differences.map((d) => d.label)
  // Measure the legend against all the room the pictures leave, then centre the whole block.
  const air = 10
  const pictures = (headed ? SD_HEADER_AIR : 0) + size.h * 2 + SD_PANEL_GAP + SD_MARK_OVERHANG * 2
  const room: Box = { left: header.body.left, top: 0, width: header.body.width, height: header.body.height - pictures - air }
  const legend = room.height > 0 ? layoutSdLegend(labels, room, font) : null
  const layout = sdPlacePanels(header.body, size, headed, legend ? legend.height + air : 0)
  const marks = differences.map((d) => d.mark)
  const objects = [
    ...header.objects,
    buildSdPicture({ lines: lines.a, box: layout.top, marks, tag, which: 'top', canonical }),
    buildSdPicture({ lines: lines.b, box: layout.bottom, marks, tag, which: 'bottom', canonical }),
  ]
  if (legend) {
    const box: Box = { left: layout.foot.left, top: layout.foot.top + air, width: layout.foot.width, height: legend.height }
    objects.push(buildSdLegend({ labels, box, layout: legend, tag, fontFamily: font }))
  }
  return objects
}

/**
 * One Spot the Differences page.
 *
 * Dealt, changed, measured, checked. A scene (a porch, a tea table, a beach)
 * is dealt against what the book and this seller have already printed; its
 * differences are dealt and each measured on the printed ink; then the whole
 * pair must pass the preflight (only the intended differences, each fair,
 * each ringed apart from the rest, neither picture bare nor cluttered, not a
 * repeat of the book) and the drawn check. A change the full check faults is
 * swapped for another; a scene that cannot hide enough fair changes is set
 * aside and another dealt; if none passes, the page says so plainly instead
 * of printing an unfair puzzle.
 *
 * The answer page is built from the very same scene and differences, so it
 * cannot disagree with the puzzle.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = sdLevelSpec(parseSdLevel(config.level))
  const fair = level.fairness
  const group = parseSdGroup(config.theme)
  const ownerSalt = resolveOwnerSalt(ctx)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const tag: StudioTag = { templateKey: SD_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  // Sized for the longest instruction this page could print, so the pictures always fit.
  const widest = drawHeader(contentBox(ctx), config, tag, sdInstruction(config, ownerSalt, fair.count[1]))
  const size = sdPanelSize(widest.body, widest.objects.length > 0)
  if (!size) return fail(SD_PAGE_TOO_SMALL_MESSAGE)
  const panel: Bounds = { minX: 0, minY: 0, maxX: size.w, maxY: size.h }

  const book = parseSdBook(parseSdRemoteData(ctx.remoteData).bookLabels, (id) => Boolean(sdRecipeById(id)))
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentScenes = new Set(studioAvoidList(SCENE_KEY, RECENT_SCENE_WINDOW))
  const exclude = new Set<string>()
  const failures = new Map<string, number>()

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rng = createRngFromSeedInput({ ownerSalt, templateKey: SD_TEMPLATE_KEY, configHash: `${group}:${level.value}`, pageNonce: ctx.seed, stream: String(attempt) })
    const recipe = pickSdRecipe({ group, rng, book, recent, exclude })
    if (!recipe) break
    const setAside = () => {
      // A scene that will not hide enough fair changes three times is left out of this page.
      const count = (failures.get(recipe.id) ?? 0) + 1
      failures.set(recipe.id, count)
      if (count >= 3) exclude.add(recipe.id)
    }

    // Deal the scene; keep the deal least like what the book and this seller already print.
    let scene: SdScene | null = null
    let best = Infinity
    for (let d = 0; d < DEALS; d++) {
      const dealt = dealScene(recipe, panel, rng, fair.fullness)
      const score = sdSimilarity(dealt, book) + (recentScenes.has(sdKindsSignature(dealt)) ? 1 : 0)
      if (score < best) (scene = dealt), (best = score)
      if (best <= SIMILAR_ENOUGH) break
    }
    if (!scene) continue

    let differences = chooseDifferences({ scene, rng, fair, count: fair.count })
    const faulted = new Set<string>()
    let lines: { a: SdLines; b: SdLines } | null = null
    let passed = false
    for (let round = 0; differences && round <= RECHOOSE; round++) {
      lines = sdPairLines(scene, differences)
      const preflight = runSdKdpPreflight({ scene, differences, level, group, book, lines })
      if (preflight.ok) {
        passed = true
        break
      }
      if (preflight.offending.length === 0) break
      preflight.offending.forEach((id) => faulted.add(id))
      differences = chooseDifferences({ scene, rng, fair, count: fair.count, exclude: faulted })
    }
    if (!passed || !differences || !lines) {
      setAside()
      continue
    }

    const entry = sdSceneEntry(scene, differences)
    const label = sdPageLabel(entry)
    const canonical = sdCanonical(scene, differences)
    const instruction = sdInstruction(config, ownerSalt, differences.length)
    const shared = { ctx, config, tag, size, lines, differences, canonical, font }
    const objects = puzzlePage({ ...shared, instruction, label })
    const answers = answerPage(shared)
    if (checkSdDrawnPage({ objects, count: differences.length, tally: true }).length > 0 || checkSdDrawnPage({ objects: answers, count: differences.length, tally: false }).length > 0) {
      setAside()
      continue
    }

    rememberStudioContent(VARIETY_KEY, [recipe.id])
    rememberStudioContent(SCENE_KEY, [sdKindsSignature(scene)])
    return [{ pageRole: 'single', objects, answerSourceObjects: answers }]
  }
  return fail(SD_BUILD_FAILED_MESSAGE)
}

export const spotTheDifferenceTemplate: StudioTemplateDefinition = {
  key: SD_TEMPLATE_KEY,
  label: 'Spot the Differences: Retirement Edition',
  category: 'spatial',
  description:
    'Two retirement scenes â€” a front porch, a tea table, a beach day, a fishing dock â€” one above the other, with 5 to 10 deliberate differences to circle. Clear black-and-white line art sized for print; every difference is measured to be fair and easy to see. Includes an answer page with each difference circled and listed.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: SD_DEFAULT_TITLE,
  prefetch: spotTheDifferencePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round">
      <rect x="14" y="2" width="36" height="16" rx="1.5"/>
      <rect x="14" y="22" width="36" height="16" rx="1.5"/>
      <path d="M14 14h36M14 34h36"/>
      <circle cx="21" cy="7" r="2.2"/>
      <path d="M36 14v-5l4-3 4 3v5M36 34v-5l4-3 4 3v5"/>
      <path d="M26 14c0-3 4-3 4 0M26 34c0-3 4-3 4 0"/>
      <path d="M31 6h4M38 11h4"/>
    </g>
    <ellipse cx="21" cy="27" rx="3.6" ry="3.2" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <ellipse cx="33" cy="26" rx="3.6" ry="2.4" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <ellipse cx="40" cy="30" rx="3.6" ry="3" fill="none" stroke="currentColor" stroke-width="0.9"/>
  </svg>`,
  configSchema: SD_CONFIG_SCHEMA,
  generate,
}
