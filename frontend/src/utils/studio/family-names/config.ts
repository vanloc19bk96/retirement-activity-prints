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
import { MAX_ROWS, MIN_ROWS, fitFamilyNamesRows } from './layout'

/** Default page heading when Page title is on (form + canvas). */
export const FAMILY_NAMES_DEFAULT_TITLE = 'My Family'

export const FAMILY_NAMES_INSTRUCTION =
  'Fill in each relative: their label (for example Mother or Uncle), first name, last name, and age.'

export function resolveFamilyNamesPageTitle(config: StudioConfig): string {
  const t = String(config.title ?? '').trim()
  // Auto “Game N” is for puzzle sheets; this keepsake page wants its own heading.
  if (!t || /^Game\s+\d+$/i.test(t)) return FAMILY_NAMES_DEFAULT_TITLE
  return t
}

/** Body the table is drawn into — the header (title + instruction) is off the top. */
export function familyNamesTableArea(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(
    { ...config, title: resolveFamilyNamesPageTitle(config) },
    FAMILY_NAMES_INSTRUCTION,
    content.width,
  )
  return {
    ...content,
    top: content.top + headerH,
    height: Math.max(1, content.height - headerH),
  }
}

/** Rows this trim can print once the header has taken its share of the page. */
export function resolveFamilyNamesRowsMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ROWS
  const area = familyNamesTableArea(config, {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'rows-max',
  })
  return Math.max(MIN_ROWS, fitFamilyNamesRows(area, MAX_ROWS))
}

export const FAMILY_NAMES_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'rowsPerPage',
    label: 'Rows per page',
    type: 'number',
    default: 10,
    min: MIN_ROWS,
    // Cap so writing lines stay large enough on 6×9 / letter with title + instruction.
    max: MAX_ROWS,
    step: 1,
    maxWhen: resolveFamilyNamesRowsMax,
    helpWhen: (config, layout) =>
      `Fewer rows means more room to write each name. Max ${resolveFamilyNamesRowsMax(
        config,
        layout,
      )} on this page size so every line stays at least 12 mm tall.`,
    help: 'Fewer rows means more room to write each name.',
  },
]
