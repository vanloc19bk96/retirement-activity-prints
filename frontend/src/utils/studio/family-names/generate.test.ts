import { describe, it, expect } from 'vitest'
import type { StudioFabricObject, StudioPageOutput } from '@/types/studio-template.types'
import { familyNamesTemplate } from './generate'
import { FAMILY_NAMES_DEFAULT_TITLE } from './config'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  runGeneratorContractTests,
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  COL_HEADER_SIZE,
  FIELD_EDGE_CLEARANCE,
  MAX_ROWS,
  computeFamilyNamesLayout,
} from './layout'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'

runGeneratorContractTests(familyNamesTemplate, {
  expectSeedVariance: false,
  configOverrides: { rowsPerPage: 10 },
})

const base = {
  ...buildDefaultConfig(familyNamesTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  rowsPerPage: 10,
  title: 'My Family',
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    if (o.type === 'group' && Array.isArray(o.objects)) {
      const cx = o.left + (o.width ?? 0) / 2
      const cy = o.top + (o.height ?? 0) / 2
      for (const child of o.objects as StudioFabricObject[]) {
        out.push({
          ...child,
          left: (child.left ?? 0) + cx,
          top: (child.top ?? 0) + cy,
        })
      }
      continue
    }
    out.push(o)
  }
  return out
}

function allText(page: StudioPageOutput): string {
  return flatten(page.objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
    .join(' ')
}

function columnHeaders(page: StudioPageOutput): string[] {
  return flatten(page.objects)
    .filter((o) => o.type === 'textbox' && o.studioRole === 'decoration')
    .map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
}

function layoutFor(config: Record<string, unknown>, ctx = STUDIO_TEST_CTX) {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    { ...config, title: String(config.title ?? 'My Family') },
    {
      templateKey: 'family-names',
      instanceId: ctx.instanceId,
      pageRole: 'single',
    },
    'Fill in each relative.',
  )
  return computeFamilyNamesLayout({
    area: header.body,
    requestedRows: Number(config.rowsPerPage ?? 10),
  })
}

describe('family-names', () => {
  it('marks seed-invariant so book runs can repeat blank roster pages', () => {
    expect(familyNamesTemplate.seedInvariant).toBe(true)
  })

  it('produces NO answer objects', () => {
    resetObjectCounter()
    const pages = familyNamesTemplate.generate(base, STUDIO_TEST_CTX)
    for (const p of pages) {
      expect(p.objects.filter((o) => o.studioRole === 'answer').length).toBe(0)
    }
  })

  it('emits exactly one page with the four column headers', () => {
    resetObjectCounter()
    const pages = familyNamesTemplate.generate(base, STUDIO_TEST_CTX)
    expect(pages.length).toBe(1)
    const headers = columnHeaders(pages[0]!)
    expect(headers).toEqual(
      expect.arrayContaining(['Label', 'First name', 'Last name', 'Age']),
    )
  })

  it('LAYOUT: rowsPerPage matches canvas rows on 6×9 and letter', () => {
    for (const label of ['6 x 9 in', '8.5 x 11 in'] as const) {
      const dims = parsePageSizeLabel(label)
      const marginGuide = calculateMarginGuide(100, false)
      const margin = resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        marginGuide,
      })
      const ctx = {
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        margin,
        seed: 1,
        instanceId: `rows-${label}`,
      }
      for (let rowsPerPage = 5; rowsPerPage <= MAX_ROWS; rowsPerPage++) {
        const layout = layoutFor({ ...base, rowsPerPage }, ctx)
        expect(layout.rows, `${label} rowsPerPage=${rowsPerPage}`).toBe(rowsPerPage)
      }
    }
  })

  it('LAYOUT: densest options with page title stay clear of the safe area', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '8.5 x 11 in'] as const) {
      const dims = parsePageSizeLabel(label)
      const marginGuide = calculateMarginGuide(100, false)
      const margin = resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        marginGuide,
      })
      const ctx = {
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        margin,
        seed: 1,
        instanceId: `title-${label}`,
      }
      resetObjectCounter()
      const [page] = familyNamesTemplate.generate(
        {
          ...base,
          title: 'My Family',
          showTitle: true,
          rowsPerPage: 6,
        },
        ctx,
      )
      assertObjectsInSafeMargin(page!.objects, ctx)
      const group = page!.objects.find((o) => o.type === 'group')
      expect(group, label).toBeTruthy()
      const left = group!.left ?? 0
      const right = left + (group!.width ?? 0)
      const top = group!.top ?? 0
      const bottom = top + (group!.height ?? 0)
      const safeLeft = ctx.margin.left
      const safeRight = ctx.pageWidth - ctx.margin.right
      const safeTop = ctx.margin.top
      const safeBottom = ctx.pageHeight - ctx.margin.bottom
      expect(left, label).toBeGreaterThanOrEqual(safeLeft - 1)
      expect(right, label).toBeLessThanOrEqual(safeRight + 1)
      expect(top, label).toBeGreaterThanOrEqual(safeTop + FIELD_EDGE_CLEARANCE - 1)
      expect(bottom, label).toBeLessThanOrEqual(safeBottom - FIELD_EDGE_CLEARANCE + 1)
    }
  })

  it('LAYOUT: all column headers share the same font size', () => {
    resetObjectCounter()
    const [page] = familyNamesTemplate.generate(base, STUDIO_TEST_CTX)
    const labels = new Set([
      'Label',
      'First\u00a0name',
      'Last\u00a0name',
      'Age',
    ])
    const headers = flatten(page!.objects).filter(
      (o) =>
        o.type === 'textbox' &&
        o.studioRole === 'decoration' &&
        labels.has(String(o.text ?? '')),
    )
    expect(headers.length).toBe(4)
    const sizes = [...new Set(headers.map((h) => Number(h.fontSize ?? 0)))]
    expect(sizes).toEqual([COL_HEADER_SIZE])
  })

  it('LAYOUT: four columns span the full table width', () => {
    const layout = layoutFor(base)
    const span = layout.columns.reduce((sum, c) => sum + c.width, 0)
    expect(span).toBe(layout.table.width)
    expect(layout.columns.map((c) => c.key)).toEqual([
      'label',
      'firstName',
      'lastName',
      'age',
    ])
  })

  it('defaults Page title text to My Family (not Game N)', () => {
    expect(familyNamesTemplate.defaultPageTitle).toBe(FAMILY_NAMES_DEFAULT_TITLE)
  })

  it('prints a custom title when the user overrides the default', () => {
    resetObjectCounter()
    const pages = familyNamesTemplate.generate(
      { ...base, title: 'Our Family Tree', showTitle: true },
      STUDIO_TEST_CTX,
    )
    const text = allText(pages[0]!)
    expect(text).toContain('Our Family Tree')
    expect(text).not.toContain(FAMILY_NAMES_DEFAULT_TITLE)
  })

  it('includes a short fill-in instruction', () => {
    resetObjectCounter()
    const pages = familyNamesTemplate.generate(
      { ...base, showInstructions: true },
      STUDIO_TEST_CTX,
    )
    expect(allText(pages[0]!).toLowerCase()).toContain('first name')
  })
})
