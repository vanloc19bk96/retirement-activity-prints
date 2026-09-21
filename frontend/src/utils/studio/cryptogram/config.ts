import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { parseRetirementCategory } from '../retirement-word-search/retirement-themes'
import { SLOT_WIDTH_EM } from './cipher'
import {
  AI_THEME_MAX_LENGTH,
  CRYPTOGRAM_INSTRUCTION,
  MAX_PUZZLES,
  MAX_SLOT_FONT,
  MIN_PUZZLES,
  categorySelectOptions,
  minSlotFont,
  parseLength,
  parsePrintStyle,
  parseWriteOwnTheme,
  themeSelectOptions,
  worstCaseSaying,
} from './content'
import { themeIpWarning } from './content-quality'
import {
  CRYPTOGRAM_BAND_GUTTER,
  CRYPTOGRAM_INDEX_W,
  countFittingSayings,
} from './layout'

function ctxFromLayout(layout: StudioConfigLayoutContext): StudioGenerateContext {
  return {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'fit-probe',
  }
}

export function cryptogramBodyBox(
  config: StudioConfig,
  layout: StudioConfigLayoutContext,
): Box {
  const content = insetHorizontal(
    contentBox(ctxFromLayout(layout)),
    STUDIO_CONTENT_SAFE_INSET_X,
  )
  const headerH = measureHeaderHeight(config, CRYPTOGRAM_INSTRUCTION, content.width)
  return {
    ...content,
    top: content.top + headerH,
    height: Math.max(1, content.height - headerH),
  }
}

/**
 * Puzzles this trim can print at the print-style floor, even for a worst-case
 * saying of the chosen length. Hard cap 6 so a letter page can fill leftover
 * body space without dropping below the print-style floor.
 */
export function resolvePuzzleCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_PUZZLES
  const minFont = minSlotFont(parsePrintStyle(config.printStyle))
  const body = cryptogramBodyBox(config, layout)
  const saying = worstCaseSaying(parseLength(config.length))
  const fitted = countFittingSayings({
    sayings: Array.from({ length: MAX_PUZZLES }, () => saying),
    bandWidth: Math.max(1, body.width - CRYPTOGRAM_INDEX_W),
    fieldHeight: body.height,
    slotEm: SLOT_WIDTH_EM,
    minFont,
    maxFont: MAX_SLOT_FONT,
    bandGutter: CRYPTOGRAM_BAND_GUTTER,
  })
  return Math.max(MIN_PUZZLES, Math.min(MAX_PUZZLES, fitted))
}

export function puzzleCountValues(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number[] {
  const max = resolvePuzzleCountMax(config, layout)
  return Array.from({ length: max }, (_, i) => i + 1)
}

export const CRYPTOGRAM_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'writeOwnTheme',
    label: 'Write my own theme',
    type: 'toggle',
    default: false,
    help: 'Off: pick a retirement category and theme. On: type any theme for AI.',
  },
  {
    key: 'retirementCategory',
    label: 'Category',
    type: 'select',
    default: 'retirement-life',
    options: categorySelectOptions(),
    visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
  },
  {
    key: 'presetThemeId',
    label: 'Theme',
    type: 'select',
    default: 'life-after-work',
    options: themeSelectOptions('retirement-life'),
    optionsWhen: (c) =>
      themeSelectOptions(parseRetirementCategory(c.retirementCategory)),
    visibleWhen: (c) => !parseWriteOwnTheme(c.writeOwnTheme),
    help: 'AI invents a fresh retirement saying for this theme each time.',
  },
  {
    key: 'customTheme',
    label: 'Custom retirement theme',
    type: 'text',
    default: '',
    max: AI_THEME_MAX_LENGTH,
    visibleWhen: (c) => parseWriteOwnTheme(c.writeOwnTheme),
    help: 'Theme only — AI writes the sayings (e.g. Retirement by the Sea). Max 120 characters.',
    warningWhen: (c) =>
      themeIpWarning(String(c.customTheme ?? c.customThemeText ?? '')),
  },
  {
    key: 'length',
    label: 'Saying length',
    type: 'select',
    default: 'medium',
    options: [
      { label: 'Short', value: 'short' },
      { label: 'Medium', value: 'medium' },
      { label: 'Long', value: 'long' },
    ],
  },
  {
    key: 'printStyle',
    label: 'Print style',
    type: 'select',
    default: 'large-print',
    options: [
      { label: 'Large print (default)', value: 'large-print' },
      { label: 'Standard', value: 'standard' },
    ],
    help: 'Large print keeps letter slots at least 14 pt.',
  },
  {
    key: 'puzzleCount',
    label: 'Puzzles per page',
    type: 'number',
    default: 2,
    min: MIN_PUZZLES,
    max: MAX_PUZZLES,
    step: 1,
    maxWhen: resolvePuzzleCountMax,
    valuesWhen: puzzleCountValues,
    helpWhen: (c, layout) => {
      const max = resolvePuzzleCountMax(c, layout)
      return max === 1
        ? 'This page only fits one puzzle at this length and print size.'
        : `This page fits up to ${max} puzzles at this length and print size.`
    },
  },
]
