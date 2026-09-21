import {
  STUDIO_TEMPLATES,
  buildDefaultConfig,
  getStudioTemplate,
} from '@/constants/studio-templates'
import { createRng } from '@/utils/studio/studio-rng'
import { estimateStudioInstancePageCount } from '@/utils/studio/studio-bulk-allocate'
import { clampStudioBulkQuantity } from '@/utils/studio/studio-bulk'
import type {
  StudioBookGameRow,
  StudioBookOrder,
  StudioBookPlanItem,
  StudioCategory,
} from '@/types/studio-template.types'

/** Upper bound on games in one whole-book run (mirrors bulk's per-run cap). */
export const STUDIO_BOOK_MAX_GAMES = 100

/** Default number of games a fresh Random-mix run proposes. */
export const STUDIO_BOOK_DEFAULT_GAME_COUNT = 12

/**
 * Templates a random book may draw from.
 * Optional category filter narrows the pool ([] = every category).
 * All templates are eligible, including AI/content games.
 */
export function getEligibleBookTemplates(options: { categories: StudioCategory[] }) {
  const { categories } = options
  return STUDIO_TEMPLATES.filter((def) => {
    if (categories.length > 0 && !categories.includes(def.category)) return false
    return true
  })
}

export interface StudioBookRandomOptions {
  gameCount: number
  seed: number
  categories: StudioCategory[]
}

/**
 * Build a random, mixed-template plan (deterministic for a given seed).
 *
 * Drawn in shuffled passes rather than independently per slot. Independent
 * picks cluster — a twelve-game book would routinely open with three sudokus
 * and never touch half the library, which reads as a padded book to a reader
 * and to a KDP reviewer. A pass exhausts the pool before the next one starts,
 * so every game appears once before any appears twice.
 */
export function buildRandomBookPlan(options: StudioBookRandomOptions): StudioBookPlanItem[] {
  const eligible = getEligibleBookTemplates({ categories: options.categories })
  if (eligible.length === 0) return []

  const count = Math.max(0, Math.min(STUDIO_BOOK_MAX_GAMES, Math.round(options.gameCount)))
  const rng = createRng(options.seed)
  const plan: StudioBookPlanItem[] = []
  let pass: typeof eligible = []
  let previousKey: string | null = null

  for (let i = 0; i < count; i++) {
    if (pass.length === 0) {
      pass = rng.shuffle(eligible)
      // A fresh pass must not reopen with the game the last one closed on.
      if (pass.length > 1 && pass[0]!.key === previousKey) {
        const swapAt = rng.int(1, pass.length - 1)
        ;[pass[0], pass[swapAt]] = [pass[swapAt]!, pass[0]!]
      }
    }
    const def = pass.shift()!
    previousKey = def.key
    plan.push({ templateKey: def.key, config: buildDefaultConfig(def) })
  }
  return plan
}

export interface StudioBookChosenOptions {
  rows: StudioBookGameRow[]
  order: StudioBookOrder
  seed: number
}

/** Expand chosen rows (game × quantity) into an ordered plan. */
export function buildChosenBookPlan(options: StudioBookChosenOptions): StudioBookPlanItem[] {
  const plan: StudioBookPlanItem[] = []
  for (const row of options.rows) {
    if (!getStudioTemplate(row.templateKey)) continue
    const quantity = clampStudioBulkQuantity(row.quantity)
    for (let i = 0; i < quantity; i++) {
      plan.push({ templateKey: row.templateKey, config: { ...row.config } })
    }
  }
  const ordered =
    options.order === 'shuffle' ? createRng(options.seed).shuffle(plan) : plan
  return ordered.slice(0, STUDIO_BOOK_MAX_GAMES)
}

/** Total instances in the chosen rows (before the max-games cap). */
export function countBookRowsTotal(rows: StudioBookGameRow[]): number {
  return rows.reduce((sum, row) => sum + clampStudioBulkQuantity(row.quantity), 0)
}

/**
 * Upper-bound pages a plan will add (puzzle pages + optional answer keys).
 * Used for the page-budget preflight and the "≈ N pages" hint.
 */
export function estimateBookPlanPages(plan: StudioBookPlanItem[]): number {
  let pages = 0
  for (const item of plan) {
    const def = getStudioTemplate(item.templateKey)
    if (def) pages += estimateStudioInstancePageCount(def)
  }
  return pages
}
