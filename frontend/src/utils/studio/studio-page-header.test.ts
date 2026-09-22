import { describe, it, expect } from 'vitest'
import {
  STUDIO_AUTO_PAGE_TITLE_SAMPLE,
  withStudioPageHeader,
} from './studio-page-header'
import { clampStudioConfigToSchema, resolveStudioConfigField } from './studio-config-fields'
import { measureHeaderHeight } from './studio-layout'
import { buildDefaultConfig, STUDIO_TEMPLATES } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import type { StudioConfigField } from '@/types/studio-template.types'

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

const INSTRUCTION = 'Fit as many rows as the page allows.'
const ROW_HEIGHT = 40

/**
 * A stand-in for any layout-aware count field.
 *
 * Written here rather than borrowed from whichever game happens to expose a
 * `maxWhen` today: this file is about the page-header contract, and a game
 * simplifying its form should not be able to delete the test for it.
 */
const rowCountField: StudioConfigField = {
  key: 'rowCount',
  label: 'Rows',
  type: 'number',
  default: 1,
  min: 1,
  step: 1,
  maxWhen: (config, layout) => {
    if (!layout) return 20
    const body =
      layout.pageHeight -
      layout.margin.top -
      layout.margin.bottom -
      measureHeaderHeight(config, INSTRUCTION)
    return Math.max(1, Math.floor(body / ROW_HEIGHT))
  },
}

const schema: StudioConfigField[] = [rowCountField]

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

describe('page header and layout-aware max', () => {
  const base = { fontFamily: 'Inter', showInstructions: true }

  it('enables Page title by default on every template', () => {
    for (const template of STUDIO_TEMPLATES) {
      expect(buildDefaultConfig(template).showTitle, template.key).toBe(true)
    }
  })

  it('reports the same max to the form as it clamps to', () => {
    const draft = { ...base, rowCount: 99 }
    const bounds = withStudioPageHeader(draft, { showTitle: true })
    const shown = resolveStudioConfigField(rowCountField, bounds, LAYOUT).max
    expect(clampStudioConfigToSchema(schema, draft, LAYOUT, bounds).rowCount).toBe(shown)
  })

  it('measures the heading out of the body a blank auto-numbered title still prints', () => {
    const draft = { ...base, rowCount: 99 }
    const titled = withStudioPageHeader(draft, { showTitle: true, title: '' })
    const untitled = withStudioPageHeader(draft, { showTitle: false })
    const withHeading = resolveStudioConfigField(rowCountField, titled, LAYOUT).max!
    const without = resolveStudioConfigField(rowCountField, untitled, LAYOUT).max!
    expect(withHeading).toBeLessThan(without)
  })
})
