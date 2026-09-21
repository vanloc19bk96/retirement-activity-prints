import type { ListItem, ListRecallResponse } from '@/types/studio-list.types'
import fallbackLists from '@/data/studio/grocery/fallback.json'
import { createRng } from '../studio-rng'

interface FallbackList {
  category: string
  targets: string[]
  distractors: Array<{ label: string; tier?: ListItem['tier'] }>
}

const LISTS = fallbackLists as FallbackList[]

export const DISTRACTOR_COUNT_MIN = 4
export const DISTRACTOR_COUNT_MAX = 20

/** Matches recall grid column choice in draw.ts. */
export function recallColumnCount(optionCount: number): number {
  return optionCount > 12 ? 3 : 2
}

/** True when list + decoys already fill complete recall-grid rows (no pad needed). */
export function fillsRecallRows(listLength: number, distractorCount: number): boolean {
  const total = listLength + distractorCount
  if (total <= 0) return true
  return total % recallColumnCount(total) === 0
}

/**
 * Decoy counts that keep the recall grid full (same rule as padOptionsToFullRows).
 * Slider steps land only on these so Extra matches what appears on the page.
 */
export function validDistractorCounts(
  listLength: number,
  min = DISTRACTOR_COUNT_MIN,
  max = DISTRACTOR_COUNT_MAX,
): number[] {
  const values: number[] = []
  for (let count = min; count <= max; count += 1) {
    if (fillsRecallRows(listLength, count)) values.push(count)
  }
  return values.length > 0 ? values : [min]
}

/** Snap decoys upward first (same direction as row-fill padding). */
export function snapDistractorCountToFullRows(
  listLength: number,
  distractorCount: number,
): number {
  const min = DISTRACTOR_COUNT_MIN
  const max = DISTRACTOR_COUNT_MAX
  const clamped = Math.min(max, Math.max(min, Math.round(distractorCount)))
  if (fillsRecallRows(listLength, clamped)) return clamped

  for (let up = clamped + 1; up <= max; up += 1) {
    if (fillsRecallRows(listLength, up)) return up
  }
  for (let down = clamped - 1; down >= min; down -= 1) {
    if (fillsRecallRows(listLength, down)) return down
  }
  return clamped
}

export function clampListLength(value: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 8
  return Math.min(20, Math.max(5, n))
}

function listsForCategory(category: string): FallbackList[] {
  const matches = LISTS.filter((entry) => entry.category === category)
  return matches.length > 0 ? matches : LISTS
}

function pickList(category: string, seed: number): FallbackList {
  const pool = listsForCategory(category)
  return pool[Math.abs(seed) % pool.length]
}

function rotatedLists(category: string, seed: number): FallbackList[] {
  const primary = listsForCategory(category)
  const start = Math.abs(seed) % primary.length
  const rotated = [...primary.slice(start), ...primary.slice(0, start)]
  const rest = LISTS.filter((entry) => !primary.includes(entry))
  return [...rotated, ...rest]
}

function unusedFillerLabels(used: Set<string>): ListItem[] {
  const fillers: ListItem[] = []
  for (const entry of LISTS) {
    for (const distractor of entry.distractors) {
      const label = distractor.label.trim()
      if (!label) continue
      const key = label.toLowerCase()
      if (used.has(key)) continue
      used.add(key)
      fillers.push({
        label,
        isTarget: false,
        tier: distractor.tier ?? 'plain',
      })
    }
    for (const target of entry.targets) {
      const label = target.trim()
      if (!label) continue
      const key = label.toLowerCase()
      if (used.has(key)) continue
      used.add(key)
      fillers.push({ label, isTarget: false, tier: 'plain' })
    }
  }
  return fillers
}

/**
 * Pad decoys so the recall grid’s last row is full (no empty trailing cells).
 * Re-shuffles with seed so fillers are not stuck in the bottom-right corner.
 */
export function padOptionsToFullRows(options: ListItem[], seed: number): ListItem[] {
  if (options.length === 0) return options
  const cols = recallColumnCount(options.length)
  const remainder = options.length % cols
  if (remainder === 0) return options

  const need = cols - remainder
  const used = new Set(options.map((item) => item.label.toLowerCase()))
  const fillers = unusedFillerLabels(used).slice(0, need)
  if (fillers.length === 0) return options
  return createRng(seed).shuffle([...options, ...fillers])
}

function takeTargetLabels(labels: string[], used: Set<string>, wanted: number): string[] {
  const targets: string[] = []
  for (const raw of labels) {
    if (targets.length >= wanted) break
    const label = raw.trim()
    const key = label.toLowerCase()
    if (!label || used.has(key)) continue
    used.add(key)
    targets.push(label)
  }
  return targets
}

function takeDecoys(items: ListItem[], used: Set<string>, wanted: number): ListItem[] {
  const decoys: ListItem[] = []
  for (const item of items) {
    if (decoys.length >= wanted) break
    const label = item.label.trim()
    const key = label.toLowerCase()
    if (!label || used.has(key)) continue
    used.add(key)
    decoys.push({ label, isTarget: false, tier: item.tier ?? 'plain' })
  }
  return decoys
}

export interface AssembleListRecallOptions {
  category: string
  listLength: number
  distractorCount: number
  seed: number
  preferredTargets?: string[]
  preferredDecoys?: ListItem[]
}

/**
 * Build a list of the requested size. Short API/fallback slices are topped up
 * from the bundled grocery catalog so Customize counts still appear on the page.
 */
export function assembleListRecall(options: AssembleListRecallOptions): ListRecallResponse {
  const wantedTargets = clampListLength(options.listLength)
  const wantedDecoys = snapDistractorCountToFullRows(wantedTargets, options.distractorCount)
  const used = new Set<string>()

  const catalogTargets = rotatedLists(options.category, options.seed).flatMap((entry) => entry.targets)
  const targets = takeTargetLabels(
    [...(options.preferredTargets ?? []), ...catalogTargets],
    used,
    wantedTargets,
  )

  const fromPreferred = takeDecoys(options.preferredDecoys ?? [], used, wantedDecoys)
  const decoys = [
    ...fromPreferred,
    ...unusedFillerLabels(used).slice(0, wantedDecoys - fromPreferred.length),
  ]

  const items: ListItem[] = [
    ...targets.map((label) => ({ label, isTarget: true })),
    ...decoys,
  ]

  return {
    targets,
    options: padOptionsToFullRows(createRng(options.seed).shuffle(items), options.seed + 1),
  }
}

/** Bundled list when the API is unavailable. */
export function resolveListFallback(
  category: string,
  listLength: number,
  distractorCount: number,
  seed: number,
): ListRecallResponse {
  const entry = pickList(category, seed)
  return assembleListRecall({
    category,
    listLength,
    distractorCount,
    seed,
    preferredTargets: entry.targets,
    preferredDecoys: entry.distractors.map((d) => ({
      label: d.label,
      isTarget: false,
      tier: d.tier ?? 'plain',
    })),
  })
}
