import { describe, it, expect } from 'vitest'
import {
  STUDIO_AUTO_PAGE_TITLE_SAMPLE,
  withStudioPageHeader,
} from './studio-page-header'
import { clampStudioConfigToSchema, resolveStudioConfigField } from './studio-config-fields'
import { getStudioTemplate, buildDefaultConfig } from '@/constants/studio-templates'
import { pickStudioVariantConfig, splitStudioConfigFields } from './studio-bulk'
import { DPI } from '@/types/canvas-settings.types'

const LAYOUT = {
  pageWidth: Math.round(6 * DPI),
  pageHeight: Math.round(9 * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
}

const template = getStudioTemplate('shape-rotation-match')!
const itemCountField = template.configSchema.find((f) => f.key === 'itemCount')!

describe('withStudioPageHeader', () => {
  it('stands in a heading when the run auto-numbers a blank title', () => {
    const merged = withStudioPageHeader({ itemCount: 12 }, { showTitle: true })
    expect(merged.title).toBe(STUDIO_AUTO_PAGE_TITLE_SAMPLE)
    expect(merged.showTitle).toBe(true)
    expect(merged.itemCount).toBe(12)
  })

  it('keeps an explicit heading and clears it when the title is off', () => {
    expect(withStudioPageHeader({}, { showTitle: true, title: 'Warm-up' }).title).toBe('Warm-up')
    expect(withStudioPageHeader({}, { showTitle: false, title: 'Warm-up' }).title).toBe('')
  })

  it('leaves showInstructions alone unless the header sets it', () => {
    expect(withStudioPageHeader({ showInstructions: false }, { showTitle: false })
      .showInstructions).toBe(false)
    expect(
      withStudioPageHeader({ showInstructions: false }, { showTitle: false, showInstructions: true })
        .showInstructions,
    ).toBe(true)
  })
})

describe('page header shrinks the layout-aware max', () => {
  const base = { ...buildDefaultConfig(template), fontFamily: 'Inter', format: 'same-different' }

  it('enables Page title by default', () => {
    expect(buildDefaultConfig(template).showTitle).toBe(true)
  })

  it('costs an item once "Game N" numbering is on', () => {
    const withoutTitle = itemCountField.maxWhen!(
      withStudioPageHeader(base, { showTitle: false }),
      LAYOUT,
    )
    const withTitle = itemCountField.maxWhen!(
      withStudioPageHeader(base, { showTitle: true }),
      LAYOUT,
    )
    expect(withTitle).toBe(withoutTitle - 1)
  })

  it('clamps a variant-only draft against the header the run will stamp', () => {
    // What a book game / bulk variation carries: no showTitle, no title.
    const { variantFields } = splitStudioConfigFields(template.configSchema)
    const draft = {
      ...pickStudioVariantConfig(base, variantFields),
      itemCount: 12,
      format: 'same-different',
    }
    const header = { showTitle: true }
    const max = itemCountField.maxWhen!(withStudioPageHeader(draft, header), LAYOUT)

    // Without boundsConfig the draft measures no heading and keeps an item too many.
    const unaware = clampStudioConfigToSchema(variantFields, draft, LAYOUT).itemCount
    expect(unaware).toBe(max + 1)
    expect(
      clampStudioConfigToSchema(
        variantFields,
        draft,
        LAYOUT,
        withStudioPageHeader(draft, header),
      ).itemCount,
    ).toBe(max)
  })

  it('reports the same max to the form as it clamps to', () => {
    const draft = { ...base, itemCount: 12 }
    const bounds = withStudioPageHeader(draft, { showTitle: true })
    const shown = resolveStudioConfigField(itemCountField, bounds, LAYOUT).max
    expect(
      clampStudioConfigToSchema(template.configSchema, draft, LAYOUT, bounds).itemCount,
    ).toBe(shown)
  })
})
