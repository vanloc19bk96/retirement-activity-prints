/**
 * What the AI templates have already printed, kept per template + theme.
 *
 * The seed in a generate request buys nothing from a language model: ask for
 * "a picnic shopping list" twice and the same eight items come back, so a book
 * repeats itself every few pages. Every AI prefetch therefore sends what it
 * printed last time in `avoid`, and the service turns that into a
 * "do not repeat these" line in the prompt.
 *
 * This lives in the browser rather than only on the server because a book is
 * built over several sittings, against however many API workers happen to
 * answer. localStorage is the only place that sees all of it.
 *
 * Storage is best-effort by design: a blocked or full store degrades to an
 * in-memory map for the session, never to a failed generation.
 */

const STORAGE_KEY = 'studio:recent-content:v1'

/** Labels sent to the server per request. Matches the backend's prompt cap. */
export const STUDIO_AVOID_LIMIT = 60
/** Labels kept per template + theme. A few sheets' worth of history. */
const MEMORY_PER_KEY = 200
/** Distinct template + theme buckets kept before the oldest is dropped. */
const MAX_KEYS = 200
const MAX_LABEL_CHARS = 60

/** Newest last, so a bucket reads as a printing history. */
type RecentStore = Record<string, string[]>

/**
 * Session fallback, used once localStorage proves unavailable or unwritable
 * (private mode, quota, SSR, tests). Non-null means "read and write here".
 */
let fallbackStore: RecentStore | null = null

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .slice(0, MAX_LABEL_CHARS)
    .trim()
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readStore(): RecentStore {
  if (fallbackStore) return fallbackStore
  const store = storage()
  if (!store) {
    fallbackStore = {}
    return fallbackStore
  }
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: RecentStore = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      out[key] = value.filter((entry): entry is string => typeof entry === 'string')
    }
    return out
  } catch {
    return {}
  }
}

function writeStore(next: RecentStore): void {
  const store = fallbackStore ? null : storage()
  if (!store) {
    fallbackStore = next
    return
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or a locked-down browser: keep the history for this session only.
    fallbackStore = next
  }
}

/**
 * Bucket the config fields that decide *what* gets written — theme, category,
 * era. Counts and layout options belong out of the key: they change the sheet,
 * not the words on it.
 */
export function studioVarietyKey(templateKey: string, ...parts: unknown[]): string {
  const tail = parts
    .map((part) => normalizeLabel(part).toLowerCase())
    .filter(Boolean)
    .join('|')
  return tail ? `${templateKey}|${tail}` : `${templateKey}|default`
}

/** Recently printed labels for this key, newest first. */
export function studioAvoidList(key: string, limit: number = STUDIO_AVOID_LIMIT): string[] {
  if (limit <= 0) return []
  const bucket = readStore()[key]
  if (!bucket?.length) return []
  return bucket.slice(-limit).reverse()
}

/** Record what a generation produced, so the next one is asked for something else. */
export function rememberStudioContent(key: string, values: Iterable<unknown>): void {
  const labels: string[] = []
  for (const value of values) {
    const label = normalizeLabel(value)
    if (label) labels.push(label)
  }
  if (labels.length === 0) return

  const store = readStore()
  const existing = store[key] ?? []
  const seen = new Set(existing.map((label) => label.toLowerCase()))
  const merged = [...existing]
  for (const label of labels) {
    const folded = label.toLowerCase()
    if (seen.has(folded)) continue
    seen.add(folded)
    merged.push(label)
  }

  const next: RecentStore = { ...store, [key]: merged.slice(-MEMORY_PER_KEY) }

  // Object key order is insertion order, so the oldest bucket is the first one.
  const keys = Object.keys(next)
  if (keys.length > MAX_KEYS) {
    for (const stale of keys.slice(0, keys.length - MAX_KEYS)) {
      if (stale !== key) delete next[stale]
    }
  }

  writeStore(next)
}

/** Test helper — drops every remembered bucket. */
export function clearStudioRecentContent(): void {
  fallbackStore = null
  const store = storage()
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear if the store refuses us.
  }
}
