import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { createRng, deriveSeed } from '../studio-rng'
import { selectOwnerIconPool } from '../studio-owner-icon-pool'
import type { StudioTag } from '../studio-fabric-builders'
import type {
  WordLadderPairPayload,
  WordLadderResponse,
} from '@/types/studio-word-ladder.types'
import { buildLadderForPair, buildWordLadder, type WordLadderPuzzle } from './ladder'
import { ladderGraph, type LadderWordLength } from './words'
import { drawWordLadders } from './draw'
import { wordLadderPrefetch } from './prefetch'
import {
  WORD_LADDER_FIELDS,
  maxLaddersFor,
  parseHintLevel,
  parseLaddersPerPage,
  parseSteps,
  parseWordLength,
  validateWordLadderConfig,
} from './config'

const TEMPLATE_KEY = 'word-ladder'

/**
 * Share of the word list one seller draws start words from.
 *
 * Two sellers running the same settings must not land on the same ladders, and
 * a seed alone does not stop that — it only reshuffles the same pool. Slicing
 * the pool per owner gives each account its own corner of the graph while
 * leaving it wide enough that a whole book never repeats itself.
 */
const OWNER_POOL_SHARE = 0.55

function ownerStartPool(connected: readonly string[], ownerKey: string | undefined): readonly string[] {
  if (!ownerKey) return connected
  const size = Math.max(120, Math.round(connected.length * OWNER_POOL_SHARE))
  if (size >= connected.length) return connected
  return selectOwnerIconPool(connected, ownerKey, size)
}

export function instructionFor(steps: number, laddersPerPage: number): string {
  const subject = laddersPerPage > 1 ? 'each ladder' : 'the ladder'
  return (
    `Change one letter at a time to climb ${subject} in ${steps} steps. ` +
    'Every rung must be a real word'
  )
}

interface ThemedPair {
  start: string
  target: string
  path: string[]
}

function cleanWord(value: unknown, length: number): string {
  const word = String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  return word.length === length ? word : ''
}

/**
 * The model's pairs, re-checked here rather than taken on trust.
 *
 * The service already enforces this, but these words are printed and their
 * chains become the answer key, so the last word on their shape belongs on the
 * side of the code that draws them.
 */
function themedPairs(
  payload: readonly WordLadderPairPayload[] | undefined,
  wordLength: LadderWordLength,
  steps: number,
): ThemedPair[] {
  if (!payload?.length) return []
  const seen = new Set<string>()
  const pairs: ThemedPair[] = []
  for (const entry of payload) {
    const start = cleanWord(entry?.start, wordLength)
    const target = cleanWord(entry?.target, wordLength)
    if (!start || !target || start === target) continue
    if (seen.has(start) || seen.has(target)) continue
    seen.add(start)
    seen.add(target)

    const raw = Array.isArray(entry?.path) ? entry.path : []
    const path = raw.map((word) => cleanWord(word, wordLength))
    pairs.push({
      start,
      target,
      // `buildLadderForPair` re-walks the chain anyway; an obviously wrong one
      // is dropped here so it does not look like a chain that was considered.
      path: path.length === steps + 1 && path.every(Boolean) ? path : [],
    })
  }
  return pairs
}

function buildPuzzles(options: {
  config: StudioConfig
  seed: number
  ownerKey?: string
  remote?: WordLadderResponse
}): WordLadderPuzzle[] {
  const { config, seed, ownerKey, remote } = options
  const wordLength = parseWordLength(config.wordLength)
  const steps = parseSteps(config.steps)
  const level = parseHintLevel(config.hintLevel)
  const wanted = Math.min(
    parseLaddersPerPage(config.laddersPerPage),
    maxLaddersFor(wordLength),
  )

  const pairs = themedPairs(remote?.pairs, wordLength, steps)
  const themedWords = pairs.flatMap((pair) => [pair.start, pair.target])
  // Themed words join the graph so they can be end words even when the curated
  // list has never heard of them; `isCore` keeps them out of the rungs.
  const graph = ladderGraph(wordLength, themedWords)
  const rng = createRng(deriveSeed(seed, `${TEMPLATE_KEY}:${wordLength}:${steps}`))

  const used = new Set<string>()
  const puzzles: WordLadderPuzzle[] = []
  const keep = (puzzle: WordLadderPuzzle): void => {
    for (const word of puzzle.path) used.add(word)
    puzzles.push(puzzle)
  }

  // Best case: both end words themed, and the chain the model suggested for them.
  for (const pair of rng.shuffle(pairs)) {
    if (puzzles.length >= wanted) break
    const puzzle = buildLadderForPair({
      graph,
      start: pair.start,
      target: pair.target,
      steps,
      level,
      rng,
      used,
      suggestedPath: pair.path,
    })
    if (puzzle) keep(puzzle)
  }

  if (puzzles.length >= wanted) return puzzles

  // Then a themed word at one end and the dictionary at the other, then the
  // curated list alone. A page with one fewer ladder still prints; an empty page
  // never should, so each pool tops up whatever the one before it left short.
  const targetPool = new Set(themedWords)
  const themedPool = themedWords.filter((word) => graph.neighbors(word).length > 0)
  const pools = [themedPool, ownerStartPool(graph.connected, ownerKey), graph.connected]
  for (const startPool of pools) {
    if (startPool.length === 0) continue
    while (puzzles.length < wanted) {
      const puzzle = buildWordLadder({
        graph,
        steps,
        startPool,
        level,
        rng,
        used,
        targetPool,
      })
      if (!puzzle) break
      keep(puzzle)
    }
    if (puzzles.length >= wanted) break
  }
  return puzzles
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzles: WordLadderPuzzle[]
  instruction: string
  maxCell?: number
}): { objects: StudioFabricObject[]; cell: number } {
  const { config, ctx, tag, puzzles, instruction, maxCell } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const ladders = drawWordLadders({
    puzzles,
    field: header.body,
    font,
    tag,
    maxCell,
  })
  return { objects: [...header.objects, ...ladders.objects], cell: ladders.cell }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const puzzles = buildPuzzles({
    config,
    seed: ctx.seed,
    ownerKey: ctx.ownerKey,
    remote: ctx.remoteData as WordLadderResponse | undefined,
  })
  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  if (puzzles.length === 0) return [{ pageRole: 'single', objects: [] }]

  const steps = puzzles[0]!.steps
  const instruction = instructionFor(steps, puzzles.length)
  const page = layoutPage({ config, ctx, tag, puzzles, instruction })
  // No how-to on the key, but the same cell size so both pages print alike.
  const key = layoutPage({
    config,
    ctx,
    tag,
    puzzles,
    instruction: '',
    maxCell: page.cell,
  })

  return [
    {
      pageRole: 'single',
      objects: page.objects,
      answerSourceObjects: key.objects,
    },
  ]
}

export const wordLadderTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Word Ladder',
  category: 'word',
  description:
    'Climb from one word to another by changing a single letter at a time, with every rung a real word. AI writes the words at the top and bottom of each ladder to your theme; the solver still guarantees exactly one solution, and the given letters adjust with the difficulty. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="17" y="3" width="30" height="9"/>
      <path d="M27 3v9M37 3v9"/>
      <rect x="17" y="15.5" width="30" height="9"/>
      <path d="M27 15.5v9M37 15.5v9"/>
      <rect x="17" y="28" width="30" height="9"/>
      <path d="M27 28v9M37 28v9"/>
    </g>
    <g font-size="7" fill="currentColor" font-family="serif" text-anchor="middle">
      <text x="22" y="10">C</text><text x="32" y="10">A</text><text x="42" y="10">T</text>
      <text x="22" y="35">D</text><text x="32" y="35">O</text><text x="42" y="35">G</text>
    </g>
  </svg>`,
  configSchema: WORD_LADDER_FIELDS,
  generate,
  prefetch: wordLadderPrefetch,
  validateConfig: validateWordLadderConfig,
}
