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
import { MAX_ROWS, MIN_ROWS, fitLogTableRows } from './layout'

/** Default page heading when Page title is on (form + canvas). */
export const SPACED_REPETITION_LOG_DEFAULT_TITLE = 'My Spaced Repetition Log'

export function resolveSpacedRepetitionLogTitle(config: StudioConfig): string {
  const t = String(config.title ?? '').trim()
  // Auto “Game N” is for puzzle sheets; this utility page wants its own heading.
  if (!t || /^Game\s+\d+$/i.test(t)) return SPACED_REPETITION_LOG_DEFAULT_TITLE
  return t
}

/** Body the log is drawn into — the page title is off the top, no instructions. */
export function spacedRepetitionLogTableArea(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(
    {
      ...config,
      title: resolveSpacedRepetitionLogTitle(config),
      showInstructions: false,
    },
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
export function resolveSpacedRepetitionLogRowsMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ROWS
  const area = spacedRepetitionLogTableArea(config, {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'rows-max',
  })
  return Math.max(
    MIN_ROWS,
    fitLogTableRows({
      area,
      requestedRows: MAX_ROWS,
      showHelper: config.showDateHelper !== false,
    }),
  )
}

export const SPACED_REPETITION_LOG_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'schedule',
    label: 'Review schedule',
    type: 'select',
    default: 'milestone',
    options: [
      { label: 'Days 1, 3, 7, 14, 30, 60', value: 'milestone' },
      { label: 'Leitner days 1, 2, 4, 8, 14', value: 'leitner' },
      { label: 'My own intervals', value: 'custom' },
    ],
  },
  {
    key: 'customIntervals',
    label: 'Your intervals (days)',
    type: 'numberList',
    default: [1, 3, 7, 21],
    visibleWhen: (c) => c.schedule === 'custom',
    help: 'One positive whole number per line (1–365). Up to 8 intervals.',
  },
  {
    key: 'rowsPerPage',
    label: 'Rows per page',
    type: 'number',
    default: 12,
    min: MIN_ROWS,
    // Cap so the log still clears the safe area when Page title is on (6×9 / letter).
    max: MAX_ROWS,
    step: 1,
    maxWhen: resolveSpacedRepetitionLogRowsMax,
    helpWhen: (config, layout) =>
      `Fewer rows means bigger boxes and more writing room. Max ${resolveSpacedRepetitionLogRowsMax(
        config,
        layout,
      )} on this page size so every tick box stays big enough to use.`,
    help: 'Fewer rows means bigger boxes and more writing room.',
  },
  {
    key: 'showDateHelper',
    label: 'Show “+3 days” hints',
    type: 'toggle',
    default: true,
    help: 'Prints the interval under each column so no counting is needed.',
  },
]
