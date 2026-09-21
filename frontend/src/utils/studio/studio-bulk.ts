import type { StudioBulkJob, StudioConfig, StudioConfigField } from '@/types/studio-template.types'
import { STUDIO_COMMON_FIELDS } from '@/constants/studio.constants'

export const STUDIO_BULK_QUANTITY_MIN = 1
export const STUDIO_BULK_QUANTITY_MAX = 50
export const STUDIO_BULK_MAX_JOBS = 20
export const STUDIO_BULK_MAX_TOTAL = 100

const SHARED_FIELD_KEYS = new Set(STUDIO_COMMON_FIELDS.map((field) => field.key))

export function isStudioSharedFieldKey(key: string): boolean {
  return SHARED_FIELD_KEYS.has(key)
}

/** Shared page-header fields vs per-game variant fields (book builder rows). */
export function splitStudioConfigFields(schema: StudioConfigField[]): {
  sharedFields: StudioConfigField[]
  variantFields: StudioConfigField[]
} {
  const sharedFields: StudioConfigField[] = []
  const variantFields: StudioConfigField[] = []
  for (const field of schema) {
    if (SHARED_FIELD_KEYS.has(field.key)) {
      sharedFields.push(field)
    } else {
      variantFields.push(field)
    }
  }
  return { sharedFields, variantFields }
}

export function pickStudioVariantConfig(
  config: StudioConfig,
  variantFields: StudioConfigField[],
): StudioConfig {
  const next: StudioConfig = {}
  for (const field of variantFields) {
    next[field.key] = config[field.key]
  }
  return next
}

export function createStudioBulkJob(variantConfig: StudioConfig): StudioBulkJob {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    config: { ...variantConfig },
    quantity: 1,
  }
}

export function clampStudioBulkQuantity(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return STUDIO_BULK_QUANTITY_MIN
  return Math.min(STUDIO_BULK_QUANTITY_MAX, Math.max(STUDIO_BULK_QUANTITY_MIN, n))
}

/** Flatten jobs into one config per generated instance. */
export function expandStudioBulkJobs(jobs: StudioBulkJob[]): StudioConfig[] {
  const out: StudioConfig[] = []
  for (const job of jobs) {
    const quantity = clampStudioBulkQuantity(job.quantity)
    for (let i = 0; i < quantity; i++) {
      out.push({ ...job.config })
    }
  }
  return out
}

export function countStudioBulkTotal(jobs: StudioBulkJob[]): number {
  return expandStudioBulkJobs(jobs).length
}

export function mergeStudioBulkConfig(
  sharedConfig: StudioConfig,
  variantConfig: StudioConfig,
): StudioConfig {
  return { ...sharedConfig, ...variantConfig }
}

export function validateStudioBulkJobs(jobs: StudioBulkJob[]): string | null {
  if (jobs.length === 0) return 'Add at least one config.'
  if (jobs.length > STUDIO_BULK_MAX_JOBS) {
    return `At most ${STUDIO_BULK_MAX_JOBS} configs.`
  }
  const total = countStudioBulkTotal(jobs)
  if (total < 1) return 'Add at least one config.'
  if (total > STUDIO_BULK_MAX_TOTAL) {
    return `Total quantity cannot exceed ${STUDIO_BULK_MAX_TOTAL}.`
  }
  return null
}
