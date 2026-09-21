import { describe, expect, it } from 'vitest'
import {
  clampStudioBulkQuantity,
  countStudioBulkTotal,
  createStudioBulkJob,
  expandStudioBulkJobs,
  mergeStudioBulkConfig,
  pickStudioVariantConfig,
  splitStudioConfigFields,
  validateStudioBulkJobs,
  STUDIO_BULK_MAX_TOTAL,
} from './studio-bulk'
import type { StudioConfigField } from '@/types/studio-template.types'

const schema: StudioConfigField[] = [
  { key: 'showTitle', label: 'Page title', type: 'toggle', default: true },
  { key: 'title', label: 'Title text', type: 'text', default: '' },
  { key: 'showInstructions', label: 'Show instructions', type: 'toggle', default: true },
  { key: 'gridRows', label: 'Rows', type: 'number', default: 3 },
  { key: 'gridCols', label: 'Columns', type: 'number', default: 3 },
]

describe('splitStudioConfigFields', () => {
  it('keeps common fields shared and template fields as variants', () => {
    const { sharedFields, variantFields } = splitStudioConfigFields(schema)
    expect(sharedFields.map((f) => f.key)).toEqual([
      'showTitle',
      'title',
      'showInstructions',
    ])
    expect(variantFields.map((f) => f.key)).toEqual(['gridRows', 'gridCols'])
  })
})

describe('expandStudioBulkJobs', () => {
  it('repeats each config by quantity', () => {
    const a = createStudioBulkJob({ gridRows: 2, gridCols: 2 })
    a.quantity = 2
    const b = createStudioBulkJob({ gridRows: 4, gridCols: 4 })
    b.quantity = 3
    const expanded = expandStudioBulkJobs([a, b])
    expect(expanded).toHaveLength(5)
    expect(expanded.filter((c) => c.gridRows === 2)).toHaveLength(2)
    expect(expanded.filter((c) => c.gridRows === 4)).toHaveLength(3)
  })
})

describe('mergeStudioBulkConfig', () => {
  it('lets variant fields override shared keys when both set', () => {
    expect(
      mergeStudioBulkConfig(
        { showInstructions: true, title: 'Game 1' },
        { gridRows: 3, showInstructions: false },
      ),
    ).toEqual({ showInstructions: false, title: 'Game 1', gridRows: 3 })
  })
})

describe('pickStudioVariantConfig', () => {
  it('copies only variant keys', () => {
    const { variantFields } = splitStudioConfigFields(schema)
    expect(
      pickStudioVariantConfig(
        { showInstructions: true, gridRows: 4, gridCols: 5, title: 'x' },
        variantFields,
      ),
    ).toEqual({ gridRows: 4, gridCols: 5 })
  })
})

describe('validateStudioBulkJobs', () => {
  it('rejects empty and over-cap totals', () => {
    expect(validateStudioBulkJobs([])).toMatch(/at least one/i)
    // Several maxed jobs can still exceed the global total cap.
    const jobs = Array.from({ length: 3 }, () => {
      const job = createStudioBulkJob({ gridRows: 3 })
      job.quantity = 50
      return job
    })
    expect(countStudioBulkTotal(jobs)).toBeGreaterThan(STUDIO_BULK_MAX_TOTAL)
    expect(validateStudioBulkJobs(jobs)).toMatch(/cannot exceed/i)
  })

  it('accepts a valid job list', () => {
    const job = createStudioBulkJob({ gridRows: 3 })
    job.quantity = 2
    expect(validateStudioBulkJobs([job])).toBeNull()
    expect(countStudioBulkTotal([job])).toBe(2)
  })
})

describe('clampStudioBulkQuantity', () => {
  it('clamps invalid values into range', () => {
    expect(clampStudioBulkQuantity(0)).toBe(1)
    expect(clampStudioBulkQuantity(999)).toBe(50)
    expect(clampStudioBulkQuantity('3')).toBe(3)
  })
})
