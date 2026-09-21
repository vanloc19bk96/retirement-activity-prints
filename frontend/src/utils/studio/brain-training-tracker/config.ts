import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { MAX_ROWS, MIN_ROWS, fitPuzzleLogRows } from './layout'

/** Default page heading when Page title is on (form + canvas). */
export const PUZZLE_LOG_DEFAULT_TITLE = 'My Puzzle Log'

export function resolvePuzzleLogTitle(config: StudioConfig): string {
  const t = String(config.title ?? '').trim()
  // Auto “Game N” is for puzzle sheets; this utility page wants its own heading (§5.4).
  if (!t || /^Game\s+\d+$/i.test(t)) return PUZZLE_LOG_DEFAULT_TITLE
  return t
}

/** Body the log is drawn into — the page title is off the top, no instructions. */
export function puzzleLogTableArea(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(
    { ...config, title: resolvePuzzleLogTitle(config), showInstructions: false },
    '',
    content.width,
  )
  return {
    ...content,
    top: content.top + headerH,
    height: Math.max(1, content.height - headerH),
  }
}

/** Rows this trim can print once the page title has taken its share. */
export function resolvePuzzleLogRowsMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ROWS
  const area = puzzleLogTableArea(config, {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'rows-max',
  })
  return Math.max(MIN_ROWS, fitPuzzleLogRows(area, MAX_ROWS))
}

export const BRAIN_TRAINING_TRACKER_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'rowsPerPage',
    label: 'Rows per page',
    type: 'number',
    default: 10,
    min: MIN_ROWS,
    // Cap so the log still clears row minima when Page title is on (6×9 / letter).
    max: MAX_ROWS,
    step: 1,
    maxWhen: resolvePuzzleLogRowsMax,
    helpWhen: (config, layout) =>
      `Fewer rows means more room to write. Max ${resolvePuzzleLogRowsMax(
        config,
        layout,
      )} on this page size so every row stays at least 12 mm tall.`,
    help: 'Fewer rows means more room to write.',
  },
  {
    key: 'showTimeTaken',
    label: 'Add a “time taken” column',
    type: 'toggle',
    default: false,
    help: 'A simple record of how long it took. Not a target and not a score.',
  },
  {
    key: 'showEnjoyment',
    label: 'Add an “enjoyed it” scale',
    type: 'toggle',
    default: true,
    help: 'Three circles labelled 1–3: not much, OK, or loved it.',
  },
  {
    key: 'notesWidth',
    label: 'Notes column',
    type: 'select',
    default: 'wide',
    options: [
      { label: 'Wide (most room to write)', value: 'wide' },
      { label: 'Standard (more room for Puzzle / page)', value: 'standard' },
    ],
  },
]
