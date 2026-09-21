import type { StudioConfig } from '@/types/studio-template.types'

export const MILESTONE_INTERVALS = [1, 3, 7, 14, 30, 60] as const
export const LEITNER_INTERVALS = [1, 2, 4, 8, 14] as const

export const MIN_CUSTOM_INTERVALS = 1
export const MAX_CUSTOM_INTERVALS = 8
/** Upper bound so column headers stay printable (“+365d”). */
export const MAX_INTERVAL_DAYS = 365

/** Normalize stored value to editable lines (preserves blanks for Enter). */
export function customIntervalLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v))
  if (typeof raw === 'string') {
    return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  }
  return []
}

/**
 * Parse custom day intervals from number[] / string[] / free text.
 * Empty lines are ignored; invalid tokens are collected for validation UI.
 */
export function parseCustomIntervals(raw: unknown): {
  intervals: number[]
  invalidTokens: string[]
} {
  const intervals: number[] = []
  const invalidTokens: string[] = []

  for (const line of customIntervalLines(raw)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    for (const part of trimmed.split(/[,\s]+/).filter(Boolean)) {
      if (!/^\d+$/.test(part)) {
        invalidTokens.push(part)
        continue
      }
      const n = Number(part)
      if (n < 1 || n > MAX_INTERVAL_DAYS) {
        invalidTokens.push(part)
        continue
      }
      intervals.push(n)
    }
  }

  return { intervals, invalidTokens }
}

export function resolveIntervals(config: StudioConfig): number[] {
  const schedule = String(config.schedule ?? 'milestone')
  if (schedule === 'leitner') return [...LEITNER_INTERVALS]
  if (schedule === 'custom') {
    return parseCustomIntervals(config.customIntervals).intervals
  }
  return [...MILESTONE_INTERVALS]
}

export function intervalColumnLabel(
  _schedule: string,
  interval: number,
  _index: number,
): string {
  // Both milestone and Leitner columns are day intervals — label by day number.
  // (Leitner “boxes” are the same schedule; Box 1/2/3 confused users who picked
  // “1, 2, 4, 8, 14 days” and expected D1/D2/… not B1/B2.)
  return `Day ${interval}`
}

/** Compact header when tick columns are narrow (e.g. Notes on). */
export function intervalColumnLabelShort(
  _schedule: string,
  interval: number,
  _index: number,
): string {
  return `D${interval}`
}

export function intervalHelperLabel(
  schedule: string,
  interval: number,
): string {
  if (schedule === 'leitner') return `every ${interval}d`
  return `+${interval}d`
}

/** Compact helper for narrow columns. */
export function intervalHelperLabelShort(
  schedule: string,
  interval: number,
): string {
  if (schedule === 'leitner') return `${interval}d`
  return `+${interval}d`
}

export function scheduleKind(config: StudioConfig): string {
  return String(config.schedule ?? 'milestone')
}
