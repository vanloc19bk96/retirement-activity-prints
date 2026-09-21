import words3 from '@/data/studio/word-ladder/words-3-en.json'
import words4 from '@/data/studio/word-ladder/words-4-en.json'
import words5 from '@/data/studio/word-ladder/words-5-en.json'

export type LadderWordLength = 3 | 4 | 5

/**
 * Curated, everyday A–Z words — no proper nouns, abbreviations or slang.
 * Puzzle quality lives or dies here: a rung the reader does not recognise
 * makes an otherwise solvable ladder feel broken.
 */
const WORDS_BY_LENGTH: Record<LadderWordLength, readonly string[]> = {
  3: words3 as string[],
  4: words4 as string[],
  5: words5 as string[],
}

export interface LadderGraph {
  length: LadderWordLength
  /** Words with at least one neighbour — the only usable rungs. */
  connected: readonly string[]
  neighbors(word: string): readonly string[]
  /**
   * True for the curated list, false for a word the model supplied.
   *
   * Model words are printed as the top and bottom of a ladder, where the reader
   * only has to read them. They are deliberately never walked *through*: a rung
   * is the answer the reader must produce unaided, so it comes from the curated
   * list or not at all.
   */
  isCore(word: string): boolean
}

function normalizeExtras(
  extras: readonly string[] | undefined,
  length: LadderWordLength,
  core: ReadonlySet<string>,
): string[] {
  if (!extras?.length) return []
  const seen = new Set<string>()
  for (const raw of extras) {
    const word = String(raw ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    if (word.length !== length || core.has(word) || seen.has(word)) continue
    seen.add(word)
  }
  return [...seen].sort()
}

/**
 * One-letter-apart adjacency, built through wildcard buckets (`C_T`) rather
 * than comparing every pair — the 5-letter list alone would be 1.6M compares.
 */
function buildGraph(length: LadderWordLength, extras: readonly string[]): LadderGraph {
  const core = WORDS_BY_LENGTH[length]
  const coreSet = new Set(core)
  const words = extras.length ? [...core, ...extras] : core
  const buckets = new Map<string, string[]>()
  for (const word of words) {
    for (let i = 0; i < length; i++) {
      const pattern = `${word.slice(0, i)}_${word.slice(i + 1)}`
      const bucket = buckets.get(pattern)
      if (bucket) bucket.push(word)
      else buckets.set(pattern, [word])
    }
  }

  const adjacency = new Map<string, string[]>()
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    for (const word of bucket) {
      let list = adjacency.get(word)
      if (!list) {
        list = []
        adjacency.set(word, list)
      }
      for (const other of bucket) {
        if (other !== word) list.push(other)
      }
    }
  }

  // Sorted + de-duplicated so traversal order never depends on bucket order.
  const connected: string[] = []
  for (const word of words) {
    const list = adjacency.get(word)
    if (!list) continue
    adjacency.set(word, [...new Set(list)].sort())
    connected.push(word)
  }

  return {
    length,
    connected,
    neighbors: (word) => adjacency.get(word) ?? [],
    isCore: (word) => coreSet.has(word),
  }
}

const graphCache = new Map<string, LadderGraph>()
/** One sheet needs one graph; a handful of themes' worth is plenty to keep. */
const GRAPH_CACHE_LIMIT = 8

/**
 * Memoised — the graph is identical for every sheet of the same word length and
 * extra-word set, and rebuilding it per ladder would dominate generate time.
 */
export function ladderGraph(
  length: LadderWordLength,
  extras?: readonly string[],
): LadderGraph {
  const clean = normalizeExtras(extras, length, new Set(WORDS_BY_LENGTH[length]))
  const key = clean.length ? `${length}|${clean.join(',')}` : String(length)
  let graph = graphCache.get(key)
  if (!graph) {
    graph = buildGraph(length, clean)
    // Plain FIFO: the base graph for each length is what gets reused, and it is
    // re-derived cheaply enough that a rare eviction costs nothing.
    if (graphCache.size >= GRAPH_CACHE_LIMIT) {
      const oldest = graphCache.keys().next().value
      if (oldest !== undefined) graphCache.delete(oldest)
    }
    graphCache.set(key, graph)
  }
  return graph
}

/** True when the two words differ in exactly one position (a legal rung step). */
export function isOneLetterApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++diff > 1) return false
  }
  return diff === 1
}
