import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { canonicalHash, createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { sgVariantKey } from '../stained-glass/content'
import { mazeContentBox } from '../maze/layout'
import { SM_CONFIG_SCHEMA } from './config'
import {
  SM_BUILD_FAILED_MESSAGE,
  SM_TEMPLATE_KEY,
  parseSmBook,
  parseSmLevel,
  parseSmTheme,
  pickSmDesign,
  smDesignDrawing,
  smDesignEntry,
  smPageLabel,
  smPageTooSmallMessage,
  type SmDesign,
  type SmLevel,
  type SmThemeChoice,
} from './content'
import { drawShapedMaze } from './draw'
import { buildShapedMaze, shapedMazeSignature, type ShapedMazePuzzle } from './generator'
import { runSmKdpPreflight, smDrawnInside } from './kdp-preflight'
import { placementsClear, planSmPage, smDrawField, smPageFits, type SmOpeningPlacement, type SmPagePlan } from './layout'
import { parseSmRemoteData, shapedMazePrefetch } from './prefetch'

/** One ledger for the whole template: a seller's next book opens with other shapes. */
const VARIETY_KEY = studioVarietyKey(SM_TEMPLATE_KEY, 'shapes')
/** About two thirds of the library: recent shapes wait, but a theme never runs dry. */
const RECENT_WINDOW = 22
/** The drawings this seller printed (`shape:version`); a few books' worth. */
const ART_VARIETY_KEY = studioVarietyKey(SM_TEMPLATE_KEY, 'art')
const RECENT_ART_WINDOW = 200
/** Designs tried before the page gives up and says so. */
const ATTEMPTS = 24

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const header = drawHeader(mazeContentBox(ctx), config, tag, '')
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

interface SmBuild {
  plan: SmPagePlan
  puzzle: ShapedMazePuzzle
  start: SmOpeningPlacement
  finish: SmOpeningPlacement
}

/**
 * Plan the page for one design and carve its maze. `unfit` when the shape
 * gives no faithful likeness at this level on this trim (its other versions
 * are the same size, so the shape is set aside whole); `no-maze` when it
 * leaves no two openings far enough apart with room for their captions.
 */
function buildDesign(options: {
  design: SmDesign
  level: SmLevel
  config: StudioConfig
  ctx: StudioGenerateContext
  font: string
  ownerSalt: string
  attempt: number
}): SmBuild | 'unfit' | 'no-maze' {
  const { design, level, config, ctx, font, ownerSalt, attempt } = options
  const field = smDrawField(ctx, config, design.instruction)
  const plan = planSmPage({ drawing: smDesignDrawing(design), field, level, journey: design.journey, font })
  if (!plan) return 'unfit'

  const startAt = new Map(plan.starts.map((p) => [p.opening, p]))
  const finishAt = new Map(plan.finishes.map((p) => [p.opening, p]))
  const gap = plan.metrics.labelGap
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: SM_TEMPLATE_KEY,
    configHash: `maze:${level.id}`,
    pageNonce: ctx.seed,
    stream: String(attempt),
  })
  // Openings come from the outline, shared by both lists; a pair is kept when
  // one can be the Start, the other the Finish, and their captions do not meet.
  const openings = [...new Set([...startAt.keys(), ...finishAt.keys()])]
  const puzzle = buildShapedMaze({
    mask: plan.mask,
    profile: level.profile,
    openings,
    compatible: (a, b) => {
      const start = startAt.get(a)
      const finish = finishAt.get(b)
      return !!start && !!finish && placementsClear(start, finish, gap)
    },
    rng,
  })
  if (!puzzle) return 'no-maze'
  const start = startAt.get(puzzle.start)
  const finish = finishAt.get(puzzle.finish)
  if (!start || !finish) return 'no-maze'
  return { plan, puzzle, start, finish }
}

/**
 * One Shaped Maze page, and its answer page.
 *
 * Chosen, fitted, carved, checked. The design (shape, drawing, journey) is
 * dealt against what the book and this seller have already printed; its
 * silhouette is laid over a grid of pencil-wide corridors and must come out a
 * faithful likeness; a perfect maze is carved inside it and the entrance and
 * exit placed where their captions have room; then the preflight walks the
 * whole thing — one way through, outline closed but for Start and Finish, the
 * key on real corridors, everything inside the safe area. A design that fails
 * anywhere is set aside and another dealt; if none passes, the page says so
 * plainly rather than printing a broken maze.
 *
 * The key is drawn from the very same puzzle object as the page — never
 * re-solved — so the two cannot disagree.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseSmLevel(config)
  const theme = parseSmTheme(config.theme)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: SM_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]

  if (!smPageFits(smDrawField(ctx, config, ''), level, font)) return fail(smPageTooSmallMessage(level))

  const book = parseSmBook(parseSmRemoteData(ctx.remoteData).bookLabels)
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentArt = studioAvoidList(ART_VARIETY_KEY, RECENT_ART_WINDOW)
  const exclude = new Set<string>()
  const excludeArt = new Set<string>()
  const failures = new Map<string, number>()

  const columnWidth = mazeContentBox(ctx).width
  const pick = (from: SmThemeChoice, attempt: number) =>
    pickSmDesign({ config, theme: from, level, seed: ctx.seed, ownerSalt, book, recent, recentArt, exclude, excludeArt, attempt, columnWidth })
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // A narrow trim can rule out a whole theme (wide vehicles on a tall thin
    // page); a clean maze in another retirement shape beats no page at all.
    const design = pick(theme, attempt) ?? (theme === 'mix' ? null : pick('mix', attempt))
    if (!design) break
    const shapeId = design.shape.subject.id
    const artKey = `${shapeId}:${sgVariantKey(design.shape.subject, design.variant)}`
    const setAside = () => {
      // A drawing that will not hold a clean maze is set aside; a shape that fails twice, too.
      excludeArt.add(artKey)
      const count = (failures.get(shapeId) ?? 0) + 1
      failures.set(shapeId, count)
      if (count >= 2) exclude.add(shapeId)
    }

    const built = buildDesign({ design, level, config, ctx, font, ownerSalt, attempt })
    if (built === 'unfit') {
      exclude.add(shapeId)
      continue
    }
    if (built === 'no-maze') {
      setAside()
      continue
    }
    const { plan, puzzle, start, finish } = built
    if (!runSmKdpPreflight({ puzzle, plan, level, start, finish }).ok) {
      setAside()
      continue
    }

    const entry = smDesignEntry(design)
    const contentLabel = smPageLabel(entry)
    const canonical = canonicalHash(shapedMazeSignature(puzzle))
    const header = drawHeader(mazeContentBox(ctx), config, tag, design.instruction)
    const draw = (dy: number): StudioFabricObject =>
      drawShapedMaze({
        puzzle,
        plan,
        start,
        finish,
        startLabel: design.journey.start.label,
        finishLabel: design.journey.finish.label,
        font,
        tag,
        dy,
        contentLabel,
        canonical,
      })
    const maze = draw(0)
    if (!smDrawnInside([maze], plan.field)) {
      setAside()
      continue
    }

    // The key: the same maze with the route shown. Without the instruction the
    // body is taller, so the maze moves up to stay centred in it; it stays
    // inside the safe area because the key's field contains the page's.
    const keyHeader = drawHeader(mazeContentBox(ctx), config, tag, '')
    const keyField = smDrawField(ctx, config, '')
    const dy = Math.round(keyField.top + keyField.height / 2 - (plan.field.top + plan.field.height / 2))
    const keyMaze = draw(dy)

    rememberStudioContent(VARIETY_KEY, [shapeId])
    rememberStudioContent(ART_VARIETY_KEY, [artKey])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, maze],
        answerSourceObjects: [...keyHeader.objects, keyMaze],
      },
    ]
  }
  return fail(SM_BUILD_FAILED_MESSAGE)
}

export const shapedMazeTemplate: StudioTemplateDefinition = {
  key: SM_TEMPLATE_KEY,
  label: 'Shaped Maze: Retirement Edition',
  category: 'spatial',
  description:
    'A maze inside a retirement shape: a teapot, a motorhome, a sun hat, a golf cart and more. Each page runs from a workday Start (the Office, the Alarm Clock) to a Finish the shape stands for (Tea Time, the Open Road). One way through, wide paths, and an answer page tracing the route.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: shapedMazePrefetch,
  // A teapot drawn as a maze: the way in through the lid, the way out through the base.
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <path stroke-width="2" d="M26 13v-3h5M35 10h3v3h4a3 3 0 0 1 3 3v14a4 4 0 0 1-4 4h-6M31 34h-8a4 4 0 0 1-4-4V16a3 3 0 0 1 3-3h4"/>
      <path stroke-width="2" d="M19 18l-7-6M19 25l-8-12M45 17h3a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3"/>
      <path stroke-width="1.2" d="M23 17h11M38 17v6M23 21v8h6M34 25h7M28 21h6M38 29v5"/>
    </g>
    <path fill="currentColor" d="M31 3.5l2 3 2-3zM31 36l2 3 2-3z"/>
  </svg>`,
  configSchema: SM_CONFIG_SCHEMA,
  generate,
}
