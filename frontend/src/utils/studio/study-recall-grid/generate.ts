import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed, type StudioRng } from '../studio-rng'
import {
  contentBox,
  drawHeader,
  insetBox,
  insetHorizontal,
  splitTop,
} from '../studio-layout'
import { buildGroup, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  buildCellContent,
  drawGridLines,
  drawInstructionBand,
  drawPageTurnCue,
  snapGridInField,
  type StudyRecallCellItem,
} from './draw'
import { STUDY_RECALL_SHAPE_IDS } from './shapes'

/** Explicit break keeps both lines roughly equal length. */
const STUDY_INSTRUCTION =
  'Study the grid. Then turn the page\nand fill in the blanks from memory'
const RECALL_INSTRUCTION = 'Write or draw each item\nin the matching cell'
/** Reserved band under the study grid for the page-turn cue. */
const PAGE_TURN_FOOTER_H = 64
/** Tall grids (e.g. 3×2) otherwise sit flush on the safe-area bottom. */
const GRID_FIELD_INSET = 12

/**
 * Prefer unique items; when the pool is smaller than the grid,
 * reshuffle and continue so every cell is filled.
 */
function sampleGridItems<T>(rng: StudioRng, pool: T[], count: number): T[] {
  if (pool.length === 0) {
    throw new Error('Symbol pool is empty')
  }
  if (count <= pool.length) {
    return rng.sample(pool, count)
  }

  const items: T[] = []
  while (items.length < count) {
    items.push(...rng.shuffle(pool))
  }
  return items.slice(0, count)
}

function resolveCellItems(rng: StudioRng, count: number): StudyRecallCellItem[] {
  const pool = STUDY_RECALL_SHAPE_IDS.map(
    (id): StudyRecallCellItem => ({ kind: 'shape', id }),
  )
  return sampleGridItems(rng, pool, count)
}

function buildGridPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  pageRole: 'study' | 'recall'
  items: StudyRecallCellItem[]
  instruction: string
}): StudioPageOutput {
  const { config, ctx, pageRole, items, instruction } = options
  const rows = Number(config.gridRows ?? 3)
  const cols = Number(config.gridCols ?? 3)
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'study-recall-grid',
    instanceId: ctx.instanceId,
    pageRole,
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  // Title via drawHeader; custom 2-line instruction (balanced wrap).
  const header = drawHeader(content, { ...config, showInstructions: false }, tag, '')
  objects.push(...header.objects)

  let field = header.body
  if (config.showInstructions !== false && instruction) {
    const band = drawInstructionBand(field, instruction, font, tag)
    objects.push(...band.objects)
    field = band.body
  }

  // Study page keeps a bottom cue; recall uses the full body so the blank grid stays centered.
  if (pageRole === 'study') {
    const footerH = Math.min(PAGE_TURN_FOOTER_H, Math.max(64, field.height * 0.12))
    const [main, footer] = splitTop(field, field.height - footerH)
    field = main
    objects.push(...drawPageTurnCue(footer, font, tag))
  }

  // Inset before fit — 3×2 is width-limited and otherwise lands on the safe bottom edge.
  const grid = snapGridInField(insetBox(field, GRID_FIELD_INSET), cols, rows)
  const gridObjects: StudioFabricObject[] = [
    ...drawGridLines(grid.bounds, grid.cell, cols, rows, tag),
  ]
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid.cellBox(r, c)
      const item = items[i++]
      if (!item) continue
      gridObjects.push(
        ...buildCellContent({
          item,
          cell,
          cellSize: grid.cell,
          tag,
          role: pageRole === 'study' ? 'prompt' : 'answer',
        }),
      )
    }
  }
  objects.push(buildGroup(gridObjects, grid.bounds, tag))

  return { pageRole, objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const rows = Number(config.gridRows ?? 3)
  const cols = Number(config.gridCols ?? 3)
  const rng = createRng(ctx.seed)
  const items = resolveCellItems(rng, rows * cols)

  const studyCtx = { ...ctx, seed: deriveSeed(ctx.seed, 'study') }
  const recallCtx = { ...ctx, seed: deriveSeed(ctx.seed, 'recall') }

  return [
    buildGridPage({
      config,
      ctx: studyCtx,
      pageRole: 'study',
      items,
      instruction: STUDY_INSTRUCTION,
    }),
    buildGridPage({
      config,
      ctx: recallCtx,
      pageRole: 'recall',
      items,
      instruction: RECALL_INSTRUCTION,
    }),
  ]
}

export const studyRecallGridTemplate: StudioTemplateDefinition = {
  key: 'study-recall-grid',
  label: 'Study & Recall Grid',
  category: 'memory',
  description:
    'Study a grid of items, then fill an empty grid from memory on the next page. Turn back to the study page to check.',
  pageCount: 2,
  // Study page already shows the items; recall is the blank grid — no extra key page.
  producesAnswerKey: false,
  showsCanvasEditHint: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="4" y="6" width="26" height="28"/><rect x="34" y="6" width="26" height="28"/>
      <path d="M4 16h26M4 26h26M13 6v28M22 6v28M34 16h26M34 26h26M43 6v28M52 6v28"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'gridRows',
      label: 'Rows',
      type: 'number',
      default: 3,
      min: 2,
      max: 5,
      step: 1,
    },
    {
      key: 'gridCols',
      label: 'Columns',
      type: 'number',
      default: 3,
      min: 2,
      max: 5,
      step: 1,
    },
  ],
  generate,
}
