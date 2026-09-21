import type { StudioRng } from '../studio-rng'
import { isOneLetterApart, type LadderGraph } from './words'

/** A letter printed into an otherwise blank rung to pin the ladder down. */
export interface LadderHint {
  /** Rung index in `path` (1 … steps - 1 — never the given first/last word). */
  rung: number
  position: number
  letter: string
}

export interface WordLadderPuzzle {
  /** Start word first, target last; every neighbouring pair differs by one letter. */
  path: string[]
  steps: number
  hints: LadderHint[]
}

export type LadderHintLevel = 'hard' | 'medium' | 'easy'

type HintMap = Map<number, Map<number, string>>

/** Attempts before the caller is told this configuration cannot be filled. */
const MAX_BUILD_ATTEMPTS = 60
/** Greedy hint rounds. Revealing every letter always ends at one path first. */
const MAX_HINT_ROUNDS = 24

/**
 * Distances out to `maxDepth`, walking only through curated words.
 *
 * A model-supplied word is recorded when it is reached — it can be the far end
 * of a ladder — but never expanded from, so it can only ever be an end word.
 * See `LadderGraph.isCore`.
 */
function bfsDistances(
  graph: LadderGraph,
  from: string,
  maxDepth: number,
): Map<string, number> {
  const distance = new Map<string, number>([[from, 0]])
  let frontier = [from]
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: string[] = []
    for (const word of frontier) {
      for (const neighbor of graph.neighbors(word)) {
        if (distance.has(neighbor)) continue
        distance.set(neighbor, depth)
        if (graph.isCore(neighbor)) next.push(neighbor)
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return distance
}

function matchesHints(word: string, hints: Map<number, string> | undefined): boolean {
  if (!hints) return true
  for (const [position, letter] of hints) {
    if (word[position] !== letter) return false
  }
  return true
}

/**
 * How many ladders of exactly `steps` moves join the two words under `hints`.
 *
 * Only words whose remaining distance to the target is exactly the moves left
 * stay in the layer, so every counted walk is a shortest path — which is also
 * what stops it from revisiting a rung.
 */
export function countLadderPaths(options: {
  graph: LadderGraph
  path: string[]
  hints: HintMap
  toTarget: Map<string, number>
}): number {
  const { graph, path, hints, toTarget } = options
  const steps = path.length - 1
  const target = path[steps]!
  let layer = new Map<string, number>([[path[0]!, 1]])

  for (let step = 1; step < steps; step++) {
    const next = new Map<string, number>()
    const rungHints = hints.get(step)
    for (const [word, count] of layer) {
      for (const neighbor of graph.neighbors(word)) {
        if (!graph.isCore(neighbor)) continue
        if (toTarget.get(neighbor) !== steps - step) continue
        if (!matchesHints(neighbor, rungHints)) continue
        next.set(neighbor, (next.get(neighbor) ?? 0) + count)
      }
    }
    if (next.size === 0) return 0
    layer = next
  }

  let total = 0
  for (const [word, count] of layer) {
    if (isOneLetterApart(word, target)) total += count
  }
  return total
}

/** Walk the target-distance layers, picking a random legal rung at each step. */
function pickPath(options: {
  graph: LadderGraph
  start: string
  target: string
  steps: number
  toTarget: Map<string, number>
  rng: StudioRng
}): string[] | null {
  const { graph, start, target, steps, toTarget, rng } = options
  const path = [start]
  let current = start
  for (let step = 1; step < steps; step++) {
    const remaining = steps - step
    const candidates = graph
      .neighbors(current)
      .filter((word) => graph.isCore(word) && toTarget.get(word) === remaining)
    if (candidates.length === 0) return null
    current = rng.pick(candidates)
    path.push(current)
  }
  path.push(target)
  return path
}

function hintList(hints: HintMap): LadderHint[] {
  const out: LadderHint[] = []
  for (const [rung, letters] of hints) {
    for (const [position, letter] of letters) out.push({ rung, position, letter })
  }
  return out.sort((a, b) => a.rung - b.rung || a.position - b.position)
}

function addHint(hints: HintMap, rung: number, position: number, letter: string): void {
  let letters = hints.get(rung)
  if (!letters) {
    letters = new Map()
    hints.set(rung, letters)
  }
  letters.set(position, letter)
}

function cloneHints(hints: HintMap): HintMap {
  return new Map([...hints].map(([rung, letters]) => [rung, new Map(letters)]))
}

/**
 * Fewest given letters that leave exactly one legal ladder.
 *
 * Each round takes the letter that rules out the most rival ladders. Revealing
 * every blank letter would pin the path outright, so the loop always ends —
 * `maxHints` is a quality gate, not a safety net: a puzzle needing more
 * hand-holding than that is thrown away for a better pair of words.
 */
function minimalHints(options: {
  graph: LadderGraph
  path: string[]
  toTarget: Map<string, number>
  maxHints: number
}): HintMap | null {
  const { graph, path, toTarget, maxHints } = options
  const steps = path.length - 1
  const length = path[0]!.length
  const hints: HintMap = new Map()
  let count = countLadderPaths({ graph, path, hints, toTarget })
  if (count === 0) return null

  for (let round = 0; count > 1 && round < MAX_HINT_ROUNDS; round++) {
    let best: { count: number; rung: number; position: number } | null = null
    for (let rung = 1; rung < steps; rung++) {
      for (let position = 0; position < length; position++) {
        if (hints.get(rung)?.has(position)) continue
        const candidate = cloneHints(hints)
        addHint(candidate, rung, position, path[rung]![position]!)
        const candidateCount = countLadderPaths({
          graph,
          path,
          hints: candidate,
          toTarget,
        })
        if (!best || candidateCount < best.count) {
          best = { count: candidateCount, rung, position }
        }
      }
    }
    if (!best) return null
    addHint(hints, best.rung, best.position, path[best.rung]![best.position]!)
    count = best.count
    if (hintList(hints).length > maxHints) return null
  }

  return count === 1 ? hints : null
}

/** Easier sheets top the minimal set up so more blank rungs start with a letter. */
function addHelperHints(options: {
  path: string[]
  hints: HintMap
  level: LadderHintLevel
  rng: StudioRng
}): void {
  const { path, hints, level, rng } = options
  if (level === 'hard') return
  const steps = path.length - 1
  const length = path[0]!.length
  const blankRungs = Array.from({ length: steps - 1 }, (_, i) => i + 1)
  const wanted =
    level === 'easy' ? blankRungs : rng.sample(blankRungs, Math.floor(blankRungs.length / 2))

  for (const rung of wanted) {
    if ((hints.get(rung)?.size ?? 0) > 0) continue
    const positions = rng.shuffle(Array.from({ length }, (_, i) => i))
    const position = positions[0]!
    addHint(hints, rung, position, path[rung]![position]!)
  }
}

/**
 * Turn a finished chain into a printable puzzle, or reject it.
 *
 * A ladder the reader can finish two different ways has no answer key, so a
 * chain that stays ambiguous under a reasonable number of given letters is
 * dropped rather than printed with a caveat. Every route into this module ends
 * here, which is what keeps that promise true of AI-suggested ladders too.
 */
function finishPuzzle(options: {
  graph: LadderGraph
  path: string[]
  toTarget: Map<string, number>
  level: LadderHintLevel
  rng: StudioRng
}): WordLadderPuzzle | null {
  const { graph, path, toTarget, level, rng } = options
  const steps = path.length - 1
  const hints = minimalHints({ graph, path, toTarget, maxHints: steps - 1 })
  if (!hints) return null
  addHelperHints({ path, hints, level, rng })
  return { path, steps, hints: hintList(hints) }
}

/** True when this chain would reprint a word already on the page. */
function reusesWord(path: string[], used: Set<string> | undefined): boolean {
  if (!used) return false
  return path.some((word) => used.has(word))
}

export interface BuildLadderOptions {
  graph: LadderGraph
  steps: number
  /** Owner-scoped candidate start words — keeps two sellers off the same ladders. */
  startPool: readonly string[]
  level: LadderHintLevel
  rng: StudioRng
  /** Words already printed on this page; a ladder reusing one is rejected. */
  used?: Set<string>
  /**
   * End words worth landing on (the themed words from the model). A target from
   * here is preferred; when none is reachable the ladder still gets built from
   * whatever the graph offers rather than losing the reader a puzzle.
   */
  targetPool?: ReadonlySet<string>
}

/** One ladder with exactly one legal solution, found by search. */
export function buildWordLadder(options: BuildLadderOptions): WordLadderPuzzle | null {
  const { graph, steps, startPool, level, rng, used, targetPool } = options
  if (steps < 2 || startPool.length === 0) return null

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const start = rng.pick(startPool)
    if (used?.has(start)) continue

    const fromStart = bfsDistances(graph, start, steps)
    const targets: string[] = []
    const themed: string[] = []
    for (const [word, distance] of fromStart) {
      if (distance !== steps || used?.has(word)) continue
      targets.push(word)
      if (targetPool?.has(word)) themed.push(word)
    }
    if (targets.length === 0) continue

    const target = rng.pick(themed.length > 0 ? themed : targets)
    const toTarget = bfsDistances(graph, target, steps)
    const path = pickPath({ graph, start, target, steps, toTarget, rng })
    if (!path || reusesWord(path.slice(1, steps), used)) continue

    const puzzle = finishPuzzle({ graph, path, toTarget, level, rng })
    if (puzzle) return puzzle
  }

  return null
}

export interface BuildLadderForPairOptions {
  graph: LadderGraph
  start: string
  target: string
  steps: number
  level: LadderHintLevel
  rng: StudioRng
  used?: Set<string>
  /**
   * A chain the model proposed for this pair. Tried first so its rungs — which
   * it picked for readability — survive; it is checked against the dictionary
   * here and quietly replaced by a solved one when it does not hold up.
   */
  suggestedPath?: readonly string[]
}

/**
 * A ladder between two given end words, or null when the dictionary cannot join
 * them in exactly `steps` moves.
 *
 * The end words come from outside (the model picked them for the theme), so the
 * shortest route between them is what decides whether they are usable at all —
 * nothing here trusts the caller further than the graph can confirm.
 */
export function buildLadderForPair(
  options: BuildLadderForPairOptions,
): WordLadderPuzzle | null {
  const { graph, start, target, steps, level, rng, used, suggestedPath } = options
  if (steps < 2 || start === target) return null
  if (start.length !== graph.length || target.length !== graph.length) return null
  if (used?.has(start) || used?.has(target)) return null
  if (graph.neighbors(start).length === 0 || graph.neighbors(target).length === 0) {
    return null
  }

  const toTarget = bfsDistances(graph, target, steps)
  if (toTarget.get(start) !== steps) return null

  if (suggestedPath && suggestedPath.length === steps + 1) {
    const path = [...suggestedPath]
    const rungs = path.slice(1, steps)
    const walkable =
      path[0] === start &&
      path[steps] === target &&
      new Set(path).size === path.length &&
      // The rungs are the answer, so they must be words the curated list vouches
      // for — a model may invent one that reads plausibly and is not a word.
      rungs.every((word) => graph.isCore(word)) &&
      !reusesWord(rungs, used) &&
      path.every((word, i) => i === 0 || isOneLetterApart(path[i - 1]!, word))
    if (walkable) {
      const puzzle = finishPuzzle({ graph, path, toTarget, level, rng })
      if (puzzle) return puzzle
    }
  }

  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const path = pickPath({ graph, start, target, steps, toTarget, rng })
    if (!path || reusesWord(path.slice(1, steps), used)) continue
    const puzzle = finishPuzzle({ graph, path, toTarget, level, rng })
    if (puzzle) return puzzle
  }

  return null
}
