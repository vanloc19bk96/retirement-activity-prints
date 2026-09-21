import type { CanvasStateStore } from '@/utils/canvas-state-store'
import { readStudioPageMeta } from './studio-instance-pages'

/** Where studio answer-key pages sit in the book. */
export type StudioSolutionPlacement = 'after-game' | 'end'

export function toStudioSolutionPlacement(solutionsAtEnd: boolean): StudioSolutionPlacement {
  return solutionsAtEnd ? 'end' : 'after-game'
}

interface InstancePages {
  puzzle: number[]
  answers: number[]
}

type PageRole = { instanceId: string; isAnswer: boolean } | null

function collectInstancePages(
  store: CanvasStateStore,
  pageCount: number,
): { roles: PageRole[]; byInstance: Map<string, InstancePages> } {
  const roles: PageRole[] = []
  const byInstance = new Map<string, InstancePages>()
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const meta = readStudioPageMeta(store, pageIndex)
    if (!meta) {
      roles.push(null)
      continue
    }
    const isAnswer = meta.pageRole === 'answers'
    roles.push({ instanceId: meta.instanceId, isAnswer })
    const entry = byInstance.get(meta.instanceId) ?? { puzzle: [], answers: [] }
    ;(isAnswer ? entry.answers : entry.puzzle).push(pageIndex)
    byInstance.set(meta.instanceId, entry)
  }
  return { roles, byInstance }
}

/** Puzzle + key pages already form one unbroken run (the default generate layout). */
function isInstanceContiguous(pages: InstancePages): boolean {
  const all = [...pages.puzzle, ...pages.answers]
  if (all.length === 0) return true
  return Math.max(...all) - Math.min(...all) + 1 === all.length
}

function isIdentityOrder(order: number[]): boolean {
  return order.every((oldIndex, newIndex) => oldIndex === newIndex)
}

/**
 * Page order that puts studio solution pages where `placement` wants them.
 * Returns `order` with `order[newIndex] = oldIndex`, or null when nothing moves.
 *
 * - `end`: every non-solution page keeps its relative order; solution pages follow,
 *   sorted by where their game sits so "Solution Game 1" leads.
 * - `after-game`: a solution page detached from its game goes right after the
 *   game's last page. Games already laid out as one run are left alone, and
 *   solutions whose game is gone stay where they are.
 */
export function resolveStudioSolutionPageOrder(
  store: CanvasStateStore,
  pageCount: number,
  placement: StudioSolutionPlacement,
): number[] | null {
  const { roles, byInstance } = collectInstancePages(store, pageCount)
  const order: number[] = []

  if (placement === 'end') {
    const answers: Array<{ pageIndex: number; sortKey: number }> = []
    roles.forEach((role, pageIndex) => {
      if (!role?.isAnswer) {
        order.push(pageIndex)
        return
      }
      const puzzle = byInstance.get(role.instanceId)?.puzzle ?? []
      answers.push({ pageIndex, sortKey: puzzle.length > 0 ? Math.min(...puzzle) : pageIndex })
    })
    answers.sort((a, b) => a.sortKey - b.sortKey || a.pageIndex - b.pageIndex)
    order.push(...answers.map((a) => a.pageIndex))
  } else {
    const isDetached = (instanceId: string): boolean => {
      const pages = byInstance.get(instanceId)
      return pages != null && pages.puzzle.length > 0 && !isInstanceContiguous(pages)
    }
    roles.forEach((role, pageIndex) => {
      if (role?.isAnswer) {
        // Detached keys are emitted with their game below.
        if (!isDetached(role.instanceId)) order.push(pageIndex)
        return
      }
      order.push(pageIndex)
      if (!role || !isDetached(role.instanceId)) return
      const pages = byInstance.get(role.instanceId)!
      if (pageIndex === Math.max(...pages.puzzle)) order.push(...pages.answers)
    })
  }

  return isIdentityOrder(order) ? null : order
}

/** Inverse of a page order: `result[oldIndex] = newIndex`. */
export function invertPageOrder(order: number[]): number[] {
  const inverse: number[] = []
  order.forEach((oldIndex, newIndex) => {
    inverse[oldIndex] = newIndex
  })
  return inverse
}

type StoredCanvasJson = { objects?: unknown[] }

/**
 * Re-mirror a studio page that moved between a verso and a recto slot.
 * Generators lay pages out against the safe area of their slot (the gutter
 * side swaps), so the studio objects follow the new slot's inset. Objects the
 * user added are left where they were placed.
 */
export function shiftStudioPageJsonX<T extends object>(canvasJson: T, dx: number): T {
  const objects = (canvasJson as StoredCanvasJson).objects
  if (dx === 0 || !Array.isArray(objects)) return canvasJson
  let changed = false
  const next = objects.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    const obj = raw as Record<string, unknown>
    if (!obj.studioInstanceId || typeof obj.left !== 'number') return raw
    changed = true
    const shifted: Record<string, unknown> = { ...obj, left: obj.left + dx }
    // Same as run-studio-generate: line endpoints travel with the object.
    if (typeof obj.x1 === 'number') shifted.x1 = obj.x1 + dx
    if (typeof obj.x2 === 'number') shifted.x2 = obj.x2 + dx
    return shifted
  })
  return changed ? { ...canvasJson, objects: next } : canvasJson
}
