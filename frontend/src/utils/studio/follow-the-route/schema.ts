import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import {
  contentBox,
  insetBox,
  insetHorizontal,
  measureHeaderHeight,
  splitTop,
  type Box,
} from '../studio-layout'
import { generateRoute } from './route'
import { planMoveLines } from './move-list'
import { LARGE_PRINT_CELL, figureSlots, planFigure } from './layout'
import { FIELD_INSET, pageInstruction, routeSpec } from './spec'
import { resolveRouteSettings, type RouteSettings } from './types'

/** The body a figure is fitted into, for a config the form has not generated yet. */
function probeSlot(
  config: StudioConfig,
  settings: RouteSettings,
  layout: StudioConfigLayoutContext,
): Box | undefined {
  const ctx: StudioGenerateContext = {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 1,
    instanceId: 'fit-probe',
  }
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const [, body] = splitTop(
    content,
    measureHeaderHeight(
      config,
      pageInstruction(settings.mode, settings.instructionStyle),
      content.width,
    ),
  )
  return figureSlots(insetBox(body, FIELD_INSET), settings.figures)[0]
}

/**
 * Square size this config would actually print, in canvas px.
 *
 * The form uses it to say when a choice has pushed the grid below large print —
 * the generator shrinks squares to fit rather than dropping figures, so without
 * this the page silently gets tighter as difficulty or figure count goes up.
 */
export function printedCellSize(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number | null {
  if (!layout) return null
  const settings = resolveRouteSettings(config)
  const slot = probeSlot(config, settings, layout)
  if (!slot) return null
  const route = generateRoute(1, routeSpec(settings))
  return planFigure({
    slot,
    route,
    lines: planMoveLines(route, settings),
    settings,
    font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
  }).cell
}

/** Adds a large-print caution to `base` when the squares come out small. */
function withPrintSizeHelp(
  base: string,
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): string {
  const cell = printedCellSize(config, layout)
  if (cell == null || cell >= LARGE_PRINT_CELL) return base
  return (
    `${base} At these settings the squares print about ${(cell / DPI).toFixed(2)} in — ` +
    'use fewer grids, a gentler difficulty or a shorter move list for large print.'
  )
}

const MODE_HELP =
  'Shading is the gentlest. Writing the coordinate adds grid reading. Writing the route is open-ended — the key prints one valid answer.'

const FIGURES_HELP = 'Fewer grids print larger.'

const CELL_HELP =
  'Caps square size when several grids share a page. One grid fills the available space.'

/**
 * The form (§6 of the spec). Mode and grids are chosen explicitly — difficulty
 * only sets grid size / move count / step length.
 */
export const FOLLOW_THE_ROUTE_FIELDS: StudioConfigField[] = [
  {
    key: 'difficulty',
    label: 'Difficulty',
    type: 'select',
    default: 'easy',
    options: [
      { label: 'Warm-up (4×4, 3 moves)', value: 'warmup' },
      { label: 'Easy (5×5, 4 moves)', value: 'easy' },
      { label: 'Medium (6×6, 6 moves)', value: 'medium' },
      { label: 'Hard (7×7, 8 moves)', value: 'hard' },
      { label: 'Expert (8×8, 9 moves)', value: 'expert' },
    ],
    help: 'Sets the grid, how many moves the reader tracks, and how far each move goes.',
  },
  {
    key: 'mode',
    label: 'What the reader does',
    type: 'select',
    default: 'mark',
    options: [
      { label: 'Shade the end square', value: 'mark' },
      { label: 'Write the coordinate', value: 'coordinate' },
      { label: 'Write the route (dot to square)', value: 'route' },
    ],
    help: MODE_HELP,
    // A write-the-route sheet prints only two marks, so one grid per page has
    // a few thousand possible sheets in total — small enough that a long book
    // (or a second seller) starts repeating pages. Every other mode prints the
    // move list too, which multiplies the possibilities out of reach.
    helpWhen: (config) => {
      const settings = resolveRouteSettings(config)
      if (settings.mode !== 'route' || settings.figures > 1) return MODE_HELP
      return (
        `${MODE_HELP} A single write-the-route grid has only a few thousand possible ` +
        'sheets — put 2 or 4 grids on a page for a long book, so pages do not repeat.'
      )
    },
  },
  {
    key: 'figuresPerPage',
    label: 'Grids per page',
    type: 'select',
    default: 4,
    options: [
      { label: '1 (largest print)', value: 1 },
      { label: '2', value: 2 },
      { label: '4', value: 4 },
    ],
    help: FIGURES_HELP,
    helpWhen: (config, layout) => withPrintSizeHelp(FIGURES_HELP, config, layout),
  },
  {
    key: 'cellSize',
    label: 'Square size',
    type: 'select',
    default: 'medium',
    options: [
      { label: 'Small', value: 'small' },
      { label: 'Medium', value: 'medium' },
      { label: 'Large (large print)', value: 'large' },
    ],
    help: CELL_HELP,
    helpWhen: (config, layout) => withPrintSizeHelp(CELL_HELP, config, layout),
  },
  {
    key: 'showCoordLabels',
    label: 'Coordinate labels',
    type: 'toggle',
    default: false,
    help: 'Letters across the top, numbers down the side.',
    // Writing the coordinate is impossible without them, so that mode forces
    // them on and the control has nothing left to decide.
    visibleWhen: (config) => resolveRouteSettings(config).mode !== 'coordinate',
  },
  {
    key: 'instructionStyle',
    label: 'Move style',
    type: 'select',
    default: 'arrows',
    options: [
      { label: 'Arrows', value: 'arrows' },
      { label: 'Words', value: 'words' },
    ],
    help: 'Arrows read fastest; words suit readers who find arrows hard to hold in mind.',
  },
  {
    key: 'showPathOnKey',
    label: 'Trace the route on the answer key',
    type: 'toggle',
    default: false,
    help: 'Draws the whole path on the solution page, so a helper can show where a wrong turn happened.',
  },
  {
    key: 'allowDiagonals',
    label: 'Allow diagonal moves',
    type: 'toggle',
    default: false,
    help: 'Adds the four diagonal arrows. Expert only — diagonals are much harder to track.',
    visibleWhen: (config) => String(config.difficulty ?? '') === 'expert',
  },
]
