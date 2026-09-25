import type { StudioRng } from '../studio-rng'
import { whoPhrase, type LgCategory, type LgValue } from './content'
import type { LgClue, LgRef, LgShape, LgSolution } from './solver'

export type LgClueKind = LgClue['kind']

/** The words a puzzle is printed in: its people and its categories' values. */
export interface LgWording {
  names: readonly string[]
  /** Index g - 1 for category group g. */
  categories: readonly { def: LgCategory; values: readonly LgValue[] }[]
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function category(w: LgWording, ref: LgRef) {
  const entry = w.categories[ref.g - 1]!
  return { def: entry.def, value: entry.values[ref.v]! }
}

/** "Carol", or "the person who brought the apple pie". */
function subject(w: LgWording, ref: LgRef): string {
  if (ref.g === 0) return w.names[ref.v]!
  const { def, value } = category(w, ref)
  return whoPhrase(def, value)
}

/** "brought the apple pie". */
function predicate(w: LgWording, ref: LgRef): string {
  const { def, value } = category(w, ref)
  return `${def.verb} ${value.phrase}`
}

function negPredicate(w: LgWording, ref: LgRef): string {
  const { def, value } = category(w, ref)
  return `${def.negVerb} ${value.phrase}`
}

/** A name and a category value, or two category values: who leads the sentence. */
function subjectAndObject(a: LgRef, b: LgRef): [LgRef, LgRef] {
  return b.g === 0 && a.g !== 0 ? [b, a] : [a, b]
}

/**
 * One clue in plain English.
 *
 * Every sentence has one verb a reader can picture, at most two "the person
 * who…" descriptions, and "either…or" only ever offers two values of the same
 * kind — so inclusive and exclusive readings can never differ.
 */
export function clueText(clue: LgClue, w: LgWording): string {
  switch (clue.kind) {
    case 'same': {
      const [s, o] = subjectAndObject(clue.a, clue.b)
      return `${cap(subject(w, s))} ${predicate(w, o)}.`
    }
    case 'diff': {
      const [s, o] = subjectAndObject(clue.a, clue.b)
      return `${cap(subject(w, s))} ${negPredicate(w, o)}.`
    }
    case 'neither':
      return `Neither ${subject(w, clue.a)} nor ${subject(w, clue.b)} ${predicate(w, clue.c)}.`
    case 'either': {
      if (clue.b.g === 0) {
        return `${cap(subject(w, clue.a))} is either ${w.names[clue.b.v]} or ${w.names[clue.c.v]}.`
      }
      const { def } = category(w, clue.b)
      const b = category(w, clue.b).value.phrase
      const c = category(w, clue.c).value.phrase
      return `${cap(subject(w, clue.a))} ${def.verb} either ${b} or ${c}.`
    }
    case 'pair':
      return `Of ${subject(w, clue.a)} and ${subject(w, clue.b)}, one ${predicate(w, clue.c)} and the other ${predicate(w, clue.d)}.`
    case 'order': {
      const ordinal = w.categories[clue.k - 1]!.def.ordinal!
      if (clue.flip) {
        const verb = clue.gap > 0 ? ordinal.stepMore(clue.gap) : ordinal.more
        return `${cap(subject(w, clue.b))} ${verb} ${subject(w, clue.a)}.`
      }
      const verb = clue.gap > 0 ? ordinal.stepLess(clue.gap) : ordinal.less
      return `${cap(subject(w, clue.a))} ${verb} ${subject(w, clue.b)}.`
    }
  }
}

/** "Robert brought the pasta salad" — a clue that fills a People cell outright. */
export function isDirectClue(clue: LgClue): boolean {
  return clue.kind === 'same' && (clue.a.g === 0 || clue.b.g === 0)
}

/** Refs a sentence describes as "the person who…". */
export function descriptionCount(clue: LgClue): number {
  const described = (ref: LgRef) => (ref.g === 0 ? 0 : 1)
  switch (clue.kind) {
    case 'same':
    case 'diff':
      return clue.a.g !== 0 && clue.b.g !== 0 ? 1 : 0
    case 'neither':
    case 'pair':
      return described(clue.a) + described(clue.b)
    case 'either':
      return described(clue.a)
    case 'order':
      return described(clue.a) + described(clue.b)
  }
}

/** Largest number of "the person who…" descriptions one clue may carry. */
const MAX_DESCRIPTIONS: Record<LgClueKind, number> = {
  same: 1,
  diff: 1,
  neither: 1,
  either: 1,
  pair: 1,
  order: 2,
}

export interface LgCandidateOptions {
  rng: StudioRng
  shape: LgShape
  solution: LgSolution
  /** Category groups whose values run in order. */
  ordinalGroups: readonly number[]
  /** Share of order clues that state an exact gap. */
  exactGapShare: number
  /** Share of references that name a person rather than describe one. */
  nameShare: number
}

/**
 * True clues of one kind about this solution, in random order. Each is built
 * from the answer itself, so nothing false can enter the pool.
 */
export function candidateClues(kind: LgClueKind, count: number, o: LgCandidateOptions): LgClue[] {
  const { rng, shape, solution, ordinalGroups } = o
  const { n, K } = shape
  const ref = (g: number, p: number): LgRef => ({ g, v: g === 0 ? p : solution[g]![p]! })
  const categoryGroup = () => rng.int(1, K)
  /** A group other than `not` — the people more often than chance, for readability. */
  const otherGroup = (...not: number[]) => {
    if (!not.includes(0) && rng.chance(o.nameShare)) return 0
    const options = Array.from({ length: K + 1 }, (_, g) => g).filter((g) => !not.includes(g))
    return rng.pick(options)
  }
  const twoPeople = () => {
    const [p, q] = rng.sample(Array.from({ length: n }, (_, i) => i), 2) as [number, number]
    return [p, q] as const
  }

  const out: LgClue[] = []
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    let clue: LgClue | null = null
    switch (kind) {
      case 'same': {
        const p = rng.int(0, n - 1)
        const g1 = categoryGroup()
        const g2 = otherGroup(g1)
        clue = { kind, a: ref(g2, p), b: ref(g1, p) }
        break
      }
      case 'diff': {
        const [p, q] = twoPeople()
        const g1 = categoryGroup()
        const g2 = otherGroup(g1)
        clue = { kind, a: ref(g2, p), b: ref(g1, q) }
        break
      }
      case 'neither': {
        if (n < 3) break
        const [p, q, r] = rng.sample(Array.from({ length: n }, (_, i) => i), 3) as [number, number, number]
        const gc = categoryGroup()
        // A name leads, so the sentence opens on someone the reader can place.
        clue = { kind, a: ref(0, q), b: ref(otherGroup(gc), p), c: ref(gc, r) }
        break
      }
      case 'either': {
        const [p, q] = twoPeople()
        const ga = rng.chance(0.5) ? 0 : categoryGroup()
        const go = ga === 0 ? categoryGroup() : otherGroup(ga)
        const [b, c] = rng.shuffle([ref(go, p), ref(go, q)]) as [LgRef, LgRef]
        clue = { kind, a: ref(ga, p), b, c }
        break
      }
      case 'pair': {
        const [p, q] = twoPeople()
        const gc = categoryGroup()
        const ga = otherGroup(gc)
        const [c, d] = rng.shuffle([ref(gc, p), ref(gc, q)]) as [LgRef, LgRef]
        clue = { kind, a: ref(0, q), b: ref(ga, p), c, d }
        break
      }
      case 'order': {
        if (ordinalGroups.length === 0) break
        const k = rng.pick(ordinalGroups)
        const [p, q] = twoPeople()
        const [lo, hi] = solution[k]![p]! < solution[k]![q]! ? [p, q] : [q, p]
        const ga = otherGroup(k)
        const gb = otherGroup(k)
        const gap = rng.chance(o.exactGapShare) ? solution[k]![hi]! - solution[k]![lo]! : 0
        clue = { kind, a: ref(ga, lo), b: ref(gb, hi), k, gap, flip: rng.chance(0.5) }
        break
      }
    }
    if (clue && descriptionCount(clue) <= MAX_DESCRIPTIONS[kind]) out.push(clue)
  }
  return out
}
