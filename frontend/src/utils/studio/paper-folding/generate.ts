import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigLayoutContext,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
  splitTop,
  type Box,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { buildFoldPuzzle, cellsKey, maxHolesFor } from './fold'
import { buildFoldItem, type FoldItem } from './distractors'
import { drawFoldingItems, fitFoldLayout } from './draw'

const OPTION_COUNT = 4
const MIN_FOLDS = 1
const MAX_FOLDS = 3
const MIN_HOLES = 1
const MAX_HOLES = 4
const MIN_ITEMS = 2
const MAX_ITEMS = 6
const GRID_SIZES = [4, 5, 6] as const
const MIN_GRID = GRID_SIZES[0]
const MAX_GRID = GRID_SIZES[GRID_SIZES.length - 1]
/** Re-rolls allowed before an item is allowed to repeat an answer already on the page. */
const MAX_ITEM_ATTEMPTS = 12

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(raw ?? fallback))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const resolveGridSize = (config: StudioConfig): number =>
  clampNumber(config.gridSize, 5, MIN_GRID, MAX_GRID)

const resolveFoldCount = (config: StudioConfig): number =>
  clampNumber(config.foldCount, 2, MIN_FOLDS, MAX_FOLDS)

/** Live ceiling for the Holes slider — the schema max would otherwise overstate it. */
function resolveHoleMax(config: StudioConfig): number {
  return Math.min(MAX_HOLES, maxHolesFor(resolveGridSize(config), resolveFoldCount(config)))
}

/**
 * Kept deliberately short: on a 5 x 8 trim the content column is under 200pt, so
 * every extra clause costs a wrapped line and eats the space the sheets need.
 */
function instructionFor(foldCount: number, punchCounts: readonly number[]): string {
  const folds =
    foldCount === 1 ? 'once' : foldCount === 2 ? 'twice' : `${foldCount} times`
  const low = punchCounts.length > 0 ? Math.min(...punchCounts) : 1
  const high = punchCounts.length > 0 ? Math.max(...punchCounts) : 1
  const holes =
    high === 1 ? 'one hole' : low === high ? `${high} holes` : `${low}–${high} holes`
  return (
    `Fold each sheet ${folds} on the dashed line, the way the arrow points, then ` +
    `punch ${holes}. Circle the opened-out pattern`
  )
}

/**
 * Builds one page of items, rejecting any whose opened pattern already appears
 * on the page. Item `i` keeps its own attempt chain, so raising the item count
 * leaves the earlier items untouched.
 */
export function buildFoldItems(options: {
  count: number
  gridSize: number
  foldCount: number
  holeCount: number
  seed: number
  ownerKey?: string
}): FoldItem[] {
  const { count, gridSize, foldCount, holeCount, seed, ownerKey } = options
  // Two sellers on the same seed must not ship the same sheet.
  const salt = ownerKey ? `${ownerKey}:` : ''
  const items: FoldItem[] = []
  const seenAnswers = new Set<string>()

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < MAX_ITEM_ATTEMPTS; attempt++) {
      const rng = createRng(deriveSeed(seed, `${salt}fold:${i}:${attempt}`))
      const puzzle = buildFoldPuzzle({ gridSize, foldCount, holeCount, rng })
      const answer = cellsKey(puzzle.solution)
      // Give up on the last attempt rather than ship a short page.
      if (attempt < MAX_ITEM_ATTEMPTS - 1 && seenAnswers.has(answer)) continue
      seenAnswers.add(answer)
      items.push(buildFoldItem({ puzzle, optionCount: OPTION_COUNT, rng }))
      break
    }
  }
  return items
}

/**
 * Tallest the header can get for this config, whichever punch counts come out.
 * Fitting against the worst case means the real body is never smaller than the
 * one the layout was measured on, so a single fit pass is safe.
 */
function worstCaseHeaderHeight(
  config: StudioConfig,
  foldCount: number,
  holeCount: number,
  width: number,
): number {
  const variants = [[1], [holeCount], [1, holeCount]]
  return Math.max(
    ...variants.map((counts) =>
      measureHeaderHeight(config, instructionFor(foldCount, counts), width),
    ),
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: FoldItem[]
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects: StudioFabricObject[] = [...header.objects]
  drawFoldingItems(objects, { field: header.body, items, font, tag })
  return objects
}

/** Body the item stack is drawn into — worst-case header off the top. */
function foldBodyFor(config: StudioConfig, ctx: StudioGenerateContext): Box {
  const foldCount = resolveFoldCount(config)
  const holeCount = Math.min(
    clampNumber(config.holeCount, 2, MIN_HOLES, MAX_HOLES),
    maxHolesFor(resolveGridSize(config), foldCount),
  )
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const [, body] = splitTop(
    content,
    worstCaseHeaderHeight(config, foldCount, holeCount, content.width),
  )
  return body
}

/**
 * Largest count this page prints in full. A coarser grid or a taller header
 * (page title, instructions) can force the layout to drop items, so the max is
 * the biggest request `fitFoldLayout` still honours exactly — asking for one
 * more would silently print fewer.
 */
export function resolveItemCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ITEMS
  const body = foldBodyFor(config, {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'item-count-max',
  })
  const foldCount = resolveFoldCount(config)
  for (let desiredItems = MAX_ITEMS; desiredItems > MIN_ITEMS; desiredItems--) {
    const fit = fitFoldLayout({
      field: body,
      desiredItems,
      desiredGrid: resolveGridSize(config),
      minGrid: MIN_GRID,
      minItems: MIN_ITEMS,
      stageCount: foldCount + 1,
      optionCount: OPTION_COUNT,
    })
    if (fit.itemCount === desiredItems) return desiredItems
  }
  return MIN_ITEMS
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const requestedGrid = resolveGridSize(config)
  const foldCount = resolveFoldCount(config)
  const itemCount = clampNumber(config.itemCount, 3, MIN_ITEMS, MAX_ITEMS)
  const holeCount = Math.min(
    clampNumber(config.holeCount, 2, MIN_HOLES, MAX_HOLES),
    maxHolesFor(requestedGrid, foldCount),
  )
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'paper-folding',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const provisionalBody = foldBodyFor(config, ctx)

  // Resolve the printable grid and item count before building anything: a
  // cramped trim can force a coarser sheet, which changes the puzzles.
  const { gridSize, itemCount: fittedCount } = fitFoldLayout({
    field: provisionalBody,
    desiredItems: itemCount,
    desiredGrid: requestedGrid,
    minGrid: MIN_GRID,
    minItems: MIN_ITEMS,
    stageCount: foldCount + 1,
    optionCount: OPTION_COUNT,
  })

  const items = buildFoldItems({
    count: fittedCount,
    gridSize,
    foldCount,
    holeCount: Math.min(holeCount, maxHolesFor(gridSize, foldCount)),
    seed: ctx.seed,
    ownerKey: ctx.ownerKey,
  })

  const instruction = instructionFor(
    foldCount,
    items.map((item) => item.puzzle.punches.length),
  )
  const layout = { config, ctx, tag, items, font }
  const objects = layoutPage({ ...layout, instruction })
  // No how-to on the key — taller body so the grouped stack re-centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const paperFoldingTemplate: StudioTemplateDefinition = {
  key: 'paper-folding',
  label: 'Paper Folding',
  category: 'spatial',
  description:
    'Follow a sheet as it is folded and punched, then picture it opened out and pick the matching hole pattern. A visual reasoning classic, generated fresh so items never repeat. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="4" y="10" width="18" height="18"/>
      <path d="M13 10v18" stroke-dasharray="3 2"/>
      <rect x="28" y="10" width="9" height="18"/>
      <rect x="45" y="10" width="16" height="18"/>
    </g>
    <g fill="currentColor">
      <circle cx="32" cy="17" r="2"/><circle cx="49" cy="17" r="2"/><circle cx="57" cy="17" r="2"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'gridSize',
      label: 'Sheet grid',
      type: 'number',
      default: 5,
      values: [...GRID_SIZES],
      help: 'How finely the sheet is divided. A finer grid gives far more distinct puzzles; a coarser one prints bigger holes.',
    },
    {
      key: 'foldCount',
      label: 'Number of folds',
      type: 'number',
      default: 2,
      min: MIN_FOLDS,
      max: MAX_FOLDS,
      step: 1,
      help: 'Creases land off-centre, so each fold roughly doubles the holes that appear when the sheet opens.',
    },
    {
      key: 'holeCount',
      label: 'Holes punched',
      type: 'number',
      default: 2,
      min: MIN_HOLES,
      max: MAX_HOLES,
      step: 1,
      maxWhen: resolveHoleMax,
      helpWhen: (c) =>
        `More holes make the opened pattern harder to picture. Max ${resolveHoleMax(c)} for this grid and fold count, so the sheet does not fill up.`,
      // A single punch has only a few hundred possible outcomes in total, so a
      // long book — or two sellers using the same settings — will repeat sheets.
      warningWhen: (c) =>
        clampNumber(c.holeCount, 2, MIN_HOLES, MAX_HOLES) === 1 && resolveHoleMax(c) > 1
          ? 'One hole gives only a few hundred possible sheets. Use 2 or more for a long book, so puzzles do not repeat.'
          : null,
    },
    {
      key: 'itemCount',
      label: 'Items per page',
      type: 'number',
      default: 3,
      min: MIN_ITEMS,
      max: MAX_ITEMS,
      step: 1,
      maxWhen: resolveItemCountMax,
      helpWhen: (config, layout) => {
        const max = resolveItemCountMax(config, layout)
        return max >= MAX_ITEMS
          ? 'Fewer items print larger.'
          : `Fewer items print larger. Max ${max} for this page size, grid, and folds, ` +
              'so the punched holes stay readable.'
      },
      help: 'Fewer items print larger.',
    },
  ],
  generate,
}
