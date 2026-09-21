import { icons as phosphorIconEntries } from '@phosphor-icons/core'

export type PhosphorPanelIcon = {
  name: string
  /** Lowercased name + tags + categories for panel search. */
  searchHaystack: string
}

const SVG_LOADERS = import.meta.glob<string>(
  '../../node_modules/@phosphor-icons/core/assets/duotone/*-duotone.svg',
  { query: '?raw', import: 'default' },
)

const loaderByName = new Map<string, () => Promise<string>>()

for (const [path, loader] of Object.entries(SVG_LOADERS)) {
  const file = path.split('/').pop() ?? ''
  const name = file.replace(/-duotone\.svg$/, '')
  if (name) loaderByName.set(name, loader)
}

/** Panel catalog: every Phosphor icon that has a duotone SVG asset. */
export const PHOSPHOR_PANEL_ICONS: readonly PhosphorPanelIcon[] = phosphorIconEntries
  .filter((entry) => loaderByName.has(entry.name))
  .map((entry) => ({
    name: entry.name,
    searchHaystack: [entry.name, ...entry.tags, ...entry.categories].join(' ').toLowerCase(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Bound parallel dynamic imports. Opening the icon panel mounts dozens of tiles;
 * firing that many `import()` calls at once fails intermittently on weaker machines.
 */
const MAX_CONCURRENT_ICON_LOADS = 8
const MAX_LOAD_ATTEMPTS = 3

const resolvedCache = new Map<string, string>()
const modulePromiseCache = new Map<string, Promise<string | null>>()

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
export function getCachedPhosphorIconSvg(iconName: string): string | null {
  return resolvedCache.get(iconName) ?? null
}

export async function loadPhosphorIconSvg(iconName: string): Promise<string | null> {
  const resolved = resolvedCache.get(iconName)
  if (resolved) return resolved

  const existing = modulePromiseCache.get(iconName)
  if (existing) return existing

  const loader = loaderByName.get(iconName)
  if (!loader) return null

  const p = (async (): Promise<string | null> => {
    await acquireLoadSlot()
    try {
      for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
        try {
          const svg = await loader()
          if (typeof svg === 'string' && svg.length > 0) {
            resolvedCache.set(iconName, svg)
            return svg
          }
        } catch {
          if (attempt < MAX_LOAD_ATTEMPTS - 1) await delay(40 * (attempt + 1))
        }
      }
      // Do not cache failures — flaky chunk loads should retry on next request.
      modulePromiseCache.delete(iconName)
      return null
    } finally {
      releaseLoadSlot()
    }
  })()

  modulePromiseCache.set(iconName, p)
  return p
}
