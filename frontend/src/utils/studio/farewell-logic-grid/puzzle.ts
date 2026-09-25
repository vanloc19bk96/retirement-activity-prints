import { createRng, deriveSeed, type StudioRng } from '../studio-rng'
import { hashStudioFingerprint } from '../studio-content-fingerprint'
import {
  LG_CATEGORIES,
  LG_MAX_LABEL_CHARS,
  LG_NAMES,
  LG_THEMES,
  lgCategory,
  numberWord,
  type LgCategory,
  type LgTheme,
  type LgValue,
} from './content'
import {
  candidateClues,
  clueText,
  descriptionCount,
  isDirectClue,
  type LgClueKind,
  type LgWording,
} from './clues'
import { lgRequirements, type LgLevel } from './levels'
import {
  clueHolds,
  clueRefs,
  countSolutions,
  fullDomains,
  propagate,
  solveByDeduction,
  type LgClue,
  type LgShape,
  type LgSolution,
} from './solver'

export interface LgPuzzle {
  level: LgLevel['value']
  shape: LgShape
  theme: LgTheme
  wording: LgWording
  solution: LgSolution
  clues: LgClue[]
  /** Printed clue sentences, in `clues` order. */
  clueTexts: string[]
  scenario: string
  /** Passes over the clues a reader needs before the grid is full. */
  rounds: number
  /** Theme and categories — the scene a reader would recognise as "the same one". */
  comboKey: string
  /** The deduction pattern with every noun stripped out. */
  structureKey: string
}

/** What the book already prints, so a new puzzle can stay clear of it. */
export interface LgAvoid {
  combos: ReadonlySet<string>
  structures: ReadonlySet<string>
  /** Times each theme already appears, to spread scenes across a book. */
  themeUse: ReadonlyMap<string, number>
}

export const EMPTY_LG_AVOID: LgAvoid = { combos: new Set(), structures: new Set(), themeUse: new Map() }

const KINDS: readonly LgClueKind[] = ['same', 'diff', 'neither', 'either', 'pair', 'order']
const MAX_ATTEMPTS = 60
/** Candidates drawn per kind; far more than any puzzle uses. */
const POOL_PER_KIND = 40

/** A content label carries both keys, so a later page can refuse either. */
const LABEL_PREFIX = 'lg'
export const lgContentLabel = (p: Pick<LgPuzzle, 'comboKey' | 'structureKey'>) =>
  `${LABEL_PREFIX}|${p.comboKey}|${p.structureKey}`

export function lgAvoidFromLabels(labels: readonly string[]): LgAvoid {
  const combos = new Set<string>()
  const structures = new Set<string>()
  const themeUse = new Map<string, number>()
  for (const label of labels) {
    const [prefix, theme, cats, structure] = label.split('|')
    if (prefix !== LABEL_PREFIX || !theme || !cats || !structure) continue
    combos.add(`${theme}|${cats}`)
    structures.add(structure)
    themeUse.set(theme, (themeUse.get(theme) ?? 0) + 1)
  }
  return { combos, structures, themeUse }
}

const byLabel = (a: LgValue, b: LgValue) => a.label.localeCompare(b.label)

/** Values for one category: an unbroken run for ordered ones, a sorted draw otherwise. */
function drawValues(rng: StudioRng, def: LgCategory, n: number): LgValue[] {
  if (def.ordinal) {
    const start = def.ordinal.fromStart ? 0 : rng.int(0, def.values.length - n)
    return def.values.slice(start, start + n)
  }
  return rng.sample(def.values, n).sort(byLabel)
}

/** People with no shared first letter, listed alphabetically. */
function drawNames(rng: StudioRng, n: number): string[] {
  const names: string[] = []
  for (const name of rng.shuffle(LG_NAMES)) {
    if (names.some((taken) => taken[0] === name[0])) continue
    names.push(name)
    if (names.length === n) break
  }
  return names.sort()
}

/** Least-used theme in the book, ties broken by the seed. */
function pickTheme(rng: StudioRng, avoid: LgAvoid): LgTheme {
  const shuffled = rng.shuffle(LG_THEMES)
  const least = Math.min(...shuffled.map((t) => avoid.themeUse.get(t.key) ?? 0))
  return shuffled.find((t) => (avoid.themeUse.get(t.key) ?? 0) === least)!
}

/**
 * Categories for the theme: Classic and Challenging always include one that
 * runs in order, so "earlier than" clues are possible. A scene the book
 * already prints is avoided while another is open.
 */
function pickCategories(
  rng: StudioRng,
  theme: LgTheme,
  shape: LgShape,
  level: LgLevel,
  avoid: LgAvoid,
): LgCategory[] | null {
  const usable = theme.categories.map(lgCategory).filter((c) => c.values.length >= shape.n)
  const needsOrder = level.value !== 'gentle'
  let fallback: LgCategory[] | null = null
  for (let tries = 0; tries < 12; tries++) {
    const picked = rng.sample(usable, shape.K)
    if (picked.length < shape.K) return null
    if (needsOrder && !picked.some((c) => c.ordinal)) continue
    fallback ??= picked
    if (!avoid.combos.has(comboKeyOf(theme, picked))) return picked
  }
  return fallback
}

const comboKeyOf = (theme: LgTheme, categories: readonly LgCategory[]) =>
  `${theme.key}|${categories.map((c) => c.key).sort().join(',')}`

function joinClauses(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses.join('')
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
}

/** The scene, then one clause per category — so the story always matches the grid. */
export function scenarioText(intro: string, shape: LgShape, categories: readonly LgCategory[]): string {
  const count = numberWord(shape.n)
  const opening = intro.replace('{n}', intro.startsWith('{n}') ? count.charAt(0).toUpperCase() + count.slice(1) : count)
  return `${opening} Each one ${joinClauses(categories.map((c) => c.scenario))}.`
}

function randomSolution(rng: StudioRng, shape: LgShape): LgSolution {
  const people = Array.from({ length: shape.n }, (_, p) => p)
  return [people, ...Array.from({ length: shape.K }, () => rng.shuffle(people))]
}

/** Candidates from every kind, interleaved by the level's odds. */
function candidateStream(rng: StudioRng, level: LgLevel, pools: Map<LgClueKind, LgClue[]>): LgClue[] {
  const stream: LgClue[] = []
  const live = () => KINDS.filter((k) => level.weights[k] > 0 && (pools.get(k)?.length ?? 0) > 0)
  for (let open = live(); open.length > 0; open = live()) {
    const total = open.reduce((sum, k) => sum + level.weights[k], 0)
    let roll = rng.next() * total
    const kind = open.find((k) => (roll -= level.weights[k]) < 0) ?? open[open.length - 1]!
    stream.push(pools.get(kind)!.pop()!)
  }
  return stream
}

/**
 * The deduction pattern with every name, value and category relabelled by
 * order of first appearance. Two puzzles that differ only in nouns share it.
 */
export function lgStructureKey(clues: readonly LgClue[], solution: LgSolution, shape: LgShape): string {
  const local = (clue: LgClue) => `${clue.kind}${clueRefs(clue).map((r) => (r.g === 0 ? 'P' : 'C')).join('')}`
  const ordered = [...clues].sort((a, b) => local(a).localeCompare(local(b)))
  const people = new Map<number, number>()
  const groups = new Map<number, number>([[0, 0]])
  const id = (map: Map<number, number>, key: number) => {
    if (!map.has(key)) map.set(key, map.size)
    return map.get(key)!
  }
  const parts = ordered.map((clue) => {
    const refs = clueRefs(clue).map((r) => {
      const person = r.g === 0 ? r.v : solution[r.g]!.indexOf(r.v)
      return `${id(groups, r.g)}.${id(people, person)}`
    })
    const extra = clue.kind === 'order' ? `@${id(groups, clue.k)}+${clue.gap}` : ''
    return `${clue.kind}:${refs.join(',')}${extra}`
  })
  return hashStudioFingerprint(`${shape.n}x${shape.K}#${parts.sort().join(';')}`)
}

export interface LgBuildOptions {
  level: LgLevel
  shape: LgShape
  seed: number
  avoid?: LgAvoid
  /** How a clue sets on the page; one past `maxLinesPerClue` lines is never offered. */
  measureClue?: (text: string) => { lines: number; height: number }
  maxLinesPerClue?: number
  /** Height every clue together may take on the page. */
  maxClueHeight?: number
}

/**
 * Build one validated puzzle, or null when no attempt passes.
 *
 * Each attempt draws a scene, people and a hidden answer, then offers true
 * clues one at a time — keeping only those that let a reader mark something
 * new — until deduction alone fills the grid. Every clue is then tried for
 * removal; one the puzzle solves without is dropped, so none is redundant.
 * What remains must meet the level's mix, fit its page, and pass
 * `validateLgPuzzle` (one answer, every clue true, every reference sound).
 */
export function buildLgPuzzle(options: LgBuildOptions): LgPuzzle | null {
  const { level, shape, seed } = options
  const avoid = options.avoid ?? EMPTY_LG_AVOID
  const measure = options.measureClue ?? (() => ({ lines: 1, height: 0 }))
  const maxLinesPerClue = options.maxLinesPerClue ?? Number.POSITIVE_INFINITY
  const maxClueHeight = options.maxClueHeight ?? Number.POSITIVE_INFINITY

  const { minKinds, minRounds } = lgRequirements(level, shape)

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng(deriveSeed(seed, `farewell-logic-grid:${attempt}`))
    const theme = pickTheme(rng, avoid)
    const categories = pickCategories(rng, theme, shape, level, avoid)
    if (!categories) continue
    const wording: LgWording = {
      names: drawNames(rng, shape.n),
      categories: categories.map((def) => ({ def, values: drawValues(rng, def, shape.n) })),
    }
    const solution = randomSolution(rng, shape)
    const ordinalGroups = categories.flatMap((c, i) => (c.ordinal ? [i + 1] : []))

    const pools = new Map<LgClueKind, LgClue[]>()
    const seen = new Set<string>()
    const heights = new Map<LgClue, number>()
    for (const kind of KINDS) {
      if (level.weights[kind] <= 0) continue
      const pool = candidateClues(kind, POOL_PER_KIND, {
        rng,
        shape,
        solution,
        ordinalGroups,
        exactGapShare: level.exactGapShare,
        nameShare: level.nameShare,
      }).filter((clue) => {
        const text = clueText(clue, wording)
        if (seen.has(text)) return false
        seen.add(text)
        const set = measure(text)
        heights.set(clue, set.height)
        return set.lines <= maxLinesPerClue
      })
      pools.set(kind, pool)
    }

    // Offer clues until the grid fills by deduction.
    const dom = fullDomains(shape)
    let chosen: LgClue[] = []
    let direct = 0
    for (const clue of candidateStream(rng, level, pools)) {
      if (isDirectClue(clue) && direct >= level.maxDirect) continue
      const alone = dom.slice()
      if (!propagate(alone, [clue], shape).ok) continue
      if (alone.every((d, i) => d === dom[i])) continue
      const trial = dom.slice()
      if (!propagate(trial, [...chosen, clue], shape).ok) continue
      chosen.push(clue)
      if (isDirectClue(clue)) direct++
      trial.forEach((d, i) => (dom[i] = d))
      if (dom.every((d) => (d & (d - 1)) === 0)) break
    }
    if (!solveByDeduction(chosen, shape).solved) continue

    // Drop every clue the puzzle can do without.
    for (const clue of rng.shuffle(chosen)) {
      const without = chosen.filter((c) => c !== clue)
      if (solveByDeduction(without, shape).solved) chosen = without
    }

    const deduction = solveByDeduction(chosen, shape)
    if (!deduction.solved || deduction.rounds < minRounds) continue
    if (new Set(chosen.map((c) => c.kind)).size < minKinds) continue
    if (chosen.reduce((sum, c) => sum + (heights.get(c) ?? 0), 0) > maxClueHeight) continue
    const negatives = chosen.filter((c) => c.kind === 'diff' || c.kind === 'neither').length
    if (negatives * 2 > chosen.length) continue

    const clues = rng.shuffle(chosen)
    const puzzle: LgPuzzle = {
      level: level.value,
      shape,
      theme,
      wording,
      solution,
      clues,
      clueTexts: clues.map((c) => clueText(c, wording)),
      scenario: scenarioText(rng.pick(theme.intros), shape, categories),
      rounds: deduction.rounds,
      comboKey: comboKeyOf(theme, categories),
      structureKey: lgStructureKey(clues, solution, shape),
    }
    if (avoid.structures.has(puzzle.structureKey)) continue
    if (validateLgPuzzle(puzzle, level).length > 0) continue
    return puzzle
  }
  return null
}

const SENTENCE = /^[A-Z][A-Za-z0-9 ,.:'\-]*\.$/

/**
 * Everything that must be true before a puzzle reaches a page. Returns the
 * problems found; an empty list means print it.
 */
export function validateLgPuzzle(puzzle: LgPuzzle, level?: LgLevel): string[] {
  const errors: string[] = []
  const { shape, wording, solution, clues, clueTexts } = puzzle
  const { n, K } = shape

  if (wording.names.length !== n || new Set(wording.names).size !== n) {
    errors.push('The people are not all different.')
  }
  if (wording.categories.length !== K) errors.push('The puzzle has the wrong number of categories.')
  const keys = new Set<string>()
  for (const { def, values } of wording.categories) {
    if (!LG_CATEGORIES.includes(def)) errors.push(`Unknown category ${def.key}.`)
    if (keys.has(def.key)) errors.push(`Category ${def.key} is used twice.`)
    keys.add(def.key)
    const labels = values.map((value) => value.label.toLowerCase())
    if (values.length !== n || new Set(labels).size !== n) {
      errors.push(`${def.title} does not have ${n} different values.`)
    }
    if (values.some((value) => !value.label.trim() || value.label.length > LG_MAX_LABEL_CHARS)) {
      errors.push(`${def.title} has a label that will not print whole.`)
    }
    if (!puzzle.scenario.includes(def.scenario)) errors.push(`The story does not mention ${def.title}.`)
  }

  if (solution.length !== K + 1) errors.push('The answer does not cover every category.')
  solution.forEach((row, g) => {
    if (row.length !== n || new Set(row).size !== n || row.some((x) => x < 0 || x >= n)) {
      errors.push('The answer does not match one value to each person.')
    }
    if (g === 0 && row.some((x, p) => x !== p)) errors.push('The answer lists the people out of order.')
  })

  const refOk = (r: { g: number; v: number }) =>
    Number.isInteger(r.g) && Number.isInteger(r.v) && r.g >= 0 && r.g <= K && r.v >= 0 && r.v < n
  clues.forEach((clue, i) => {
    const refs = clueRefs(clue)
    if (!refs.every(refOk)) {
      errors.push(`Clue ${i + 1} points at something that is not in the grid.`)
      return
    }
    if (clue.kind === 'order') {
      const ordinal = wording.categories[clue.k - 1]?.def.ordinal
      if (!ordinal || clue.a.g === clue.k || clue.b.g === clue.k || clue.gap < 0 || clue.gap >= n) {
        errors.push(`Clue ${i + 1} compares values that have no order.`)
      }
    }
    if ((clue.kind === 'same' || clue.kind === 'diff') && clue.a.g === clue.b.g) {
      errors.push(`Clue ${i + 1} compares two values of one category.`)
    }
    if (clue.kind === 'either' && (clue.b.g !== clue.c.g || clue.b.v === clue.c.v || clue.a.g === clue.b.g)) {
      errors.push(`Clue ${i + 1} offers a choice that is not a real choice.`)
    }
    if (clue.kind === 'pair' && (clue.c.g !== clue.d.g || clue.c.v === clue.d.v || clue.a.g === clue.c.g || clue.b.g === clue.c.g)) {
      errors.push(`Clue ${i + 1} pairs values that cannot be told apart.`)
    }
    if (descriptionCount(clue) > 2) errors.push(`Clue ${i + 1} is too hard to read.`)
    if (!clueHolds(clue, solution)) errors.push(`Clue ${i + 1} is not true of the answer.`)
    const text = clueTexts[i] ?? ''
    if (text !== clueText(clue, wording) || !SENTENCE.test(text) || /\s{2}|undefined|null/.test(text)) {
      errors.push(`Clue ${i + 1} is not a clean sentence.`)
    }
  })
  if (clueTexts.length !== clues.length || new Set(clueTexts).size !== clueTexts.length) {
    errors.push('A clue is printed twice.')
  }

  if (errors.length > 0) return errors
  if (!solveByDeduction(clues, shape).solved) errors.push('The clues do not lead to the answer without guessing.')
  if (countSolutions(clues, shape) !== 1) errors.push('The clues allow more than one answer.')
  if (level) {
    const direct = clues.filter(isDirectClue).length
    if (direct > level.maxDirect) errors.push('Too many clues give an answer away outright.')
  }
  return errors
}
