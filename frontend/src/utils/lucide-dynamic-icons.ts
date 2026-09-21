import type { LucideIcon } from 'lucide-react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'

import type { LucideIconNode } from '@/utils/lucide-fabric'

export type LucideIconModule = {
  default: LucideIcon
  __iconNode: LucideIconNode
}

type IconLoader = () => Promise<LucideIconModule>

const loaders = dynamicIconImports as Record<string, IconLoader | undefined>

/**
 * Bound parallel dynamic imports. Opening the icon panel mounts dozens of tiles;
 * firing that many `import()` calls at once fails intermittently on weaker machines
 * ("Failed to fetch dynamically imported module").
 */
const MAX_CONCURRENT_ICON_LOADS = 8
const MAX_LOAD_ATTEMPTS = 3

const resolvedCache = new Map<string, LucideIconModule>()
const modulePromiseCache = new Map<string, Promise<LucideIconModule | null>>()

let activeLoads = 0
const waitQueue: Array<() => void> = []

function acquireLoadSlot(): Promise<void> {
  if (activeLoads < MAX_CONCURRENT_ICON_LOADS) {
    activeLoads += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeLoads += 1
      resolve()
    })
  })
}

function releaseLoadSlot(): void {
  activeLoads = Math.max(0, activeLoads - 1)
  const next = waitQueue.shift()
  if (next) next()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Sync hit after a successful load — avoids placeholder flash on virtualized remount. */
export function getCachedLucideIconModule(kebabName: string): LucideIconModule | null {
  return resolvedCache.get(kebabName) ?? null
}

export async function loadLucideIconModule(kebabName: string): Promise<LucideIconModule | null> {
  const resolved = resolvedCache.get(kebabName)
  if (resolved) return resolved

  const existing = modulePromiseCache.get(kebabName)
  if (existing) return existing

  const loader = loaders[kebabName]
  if (!loader) return null

  const p = (async (): Promise<LucideIconModule | null> => {
    await acquireLoadSlot()
    try {
      for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
        try {
          const mod = await loader()
          resolvedCache.set(kebabName, mod)
          return mod
        } catch {
          if (attempt < MAX_LOAD_ATTEMPTS - 1) await delay(40 * (attempt + 1))
        }
      }
      // Do not cache failures — flaky chunk loads should retry on next request.
      modulePromiseCache.delete(kebabName)
      return null
    } finally {
      releaseLoadSlot()
    }
  })()

  modulePromiseCache.set(kebabName, p)
  return p
}
