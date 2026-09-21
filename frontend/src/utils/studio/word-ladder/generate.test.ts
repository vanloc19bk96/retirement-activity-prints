import { describe, it, expect } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import { harvestAnswers } from '../studio-answer-key'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { wordLadderTemplate, instructionFor } from './generate'
import { isOneLetterApart, ladderGraph, type LadderGraph } from './words'
import {
  buildLadderForPair,
  buildWordLadder,
  countLadderPaths,
  type WordLadderPuzzle,
} from './ladder'
import { createRng } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  unionObjectBounds,
} from '../studio-layout'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { maxLaddersFor } from './config'

const BASE = { ...buildDefaultConfig(wordLadderTemplate), fontFamily: 'PT Serif' }

function generate(overrides: Record<string, unknown> = {}, seed = 42) {
  resetObjectCounter()
  return wordLadderTemplate.generate(
    { ...BASE, ...overrides, seed },
    { ...STUDIO_TEST_CTX, seed },
  )
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => (obj.objects ? flatten(obj.objects) : [obj]))
}

/** Every letter the sheet prints in ink, in draw order — each word is contiguous. */
function printedLetters(objects: StudioFabricObject[]): string {
  return flatten(objects)
    .filter((obj) => obj.studioRole === 'prompt')
    .map((obj) => obj.text ?? '')
    .join('')
}

/** How many ladders the given letters still leave open. Exactly 1 is the promise. */
function solutionCount(graph: LadderGraph, puzzle: WordLadderPuzzle): number {
  const { path, steps } = puzzle
  const hints = new Map<number, Map<number, string>>()
  for (const hint of puzzle.hints) {
    const letters = hints.get(hint.rung) ?? new Map<number, string>()
    letters.set(hint.position, hint.letter)
    hints.set(hint.rung, letters)
  }

  // Distances to the target, rebuilt the way the counter expects them.
  const toTarget = new Map<string, number>([[path[steps]!, 0]])
  let frontier = [path[steps]!]
  for (let depth = 1; depth <= steps; depth++) {
    const next: string[] = []
    for (const word of frontier) {
      for (const neighbor of graph.neighbors(word)) {
        if (toTarget.has(neighbor)) continue
        toTarget.set(neighbor, depth)
        if (graph.isCore(neighbor)) next.push(neighbor)
      }
    }
    frontier = next
  }
  return countLadderPaths({ graph, path, hints, toTarget })
}

runGeneratorContractTests(wordLadderTemplate)
assertGeneratorEntropy(wordLadderTemplate)

describe('word-ladder puzzles', () => {
  it('builds ladders whose every step changes exactly one letter', () => {
    const graph = ladderGraph(4)
    const rng = createRng(9)
    for (let i = 0; i < 25; i++) {
      const puzzle = buildWordLadder({
        graph,
        steps: 4,
        startPool: graph.connected,
        level: 'hard',
        rng,
      })
      expect(puzzle).not.toBeNull()
      const path = puzzle!.path
      expect(path).toHaveLength(5)
      expect(new Set(path).size).toBe(path.length)
      for (let step = 1; step < path.length; step++) {
        expect(isOneLetterApart(path[step - 1]!, path[step]!)).toBe(true)
      }
    }
  })

  it('leaves exactly one legal ladder once the given letters are printed', () => {
    for (const [length, steps] of [
      [3, 3],
      [4, 4],
      [4, 5],
      [5, 3],
    ] as const) {
      const graph = ladderGraph(length)
      const rng = createRng(length * 31 + steps)
      for (let i = 0; i < 12; i++) {
        const puzzle = buildWordLadder({
          graph,
          steps,
          startPool: graph.connected,
          level: 'hard',
          rng,
        })
        expect(puzzle).not.toBeNull()
        expect(solutionCount(graph, puzzle!)).toBe(1)
      }
    }
  })

  it('never prints a given letter on the rungs the reader must fill alone', () => {
    const graph = ladderGraph(4)
    const rng = createRng(3)
    const puzzle = buildWordLadder({
      graph,
      steps: 4,
      startPool: graph.connected,
      level: 'easy',
      rng,
    })!
    for (const hint of puzzle.hints) {
      expect(hint.rung).toBeGreaterThan(0)
      expect(hint.rung).toBeLessThan(puzzle.steps)
      expect(puzzle.path[hint.rung]![hint.position]).toBe(hint.letter)
    }
  })

  it('gives every blank rung a letter on the easy setting', () => {
    const graph = ladderGraph(4)
    const rng = createRng(11)
    for (let i = 0; i < 10; i++) {
      const puzzle = buildWordLadder({
        graph,
        steps: 5,
        startPool: graph.connected,
        level: 'easy',
        rng,
      })!
      const rungs = new Set(puzzle.hints.map((hint) => hint.rung))
      expect(rungs.size).toBe(puzzle.steps - 1)
    }
  })

  it('keeps two sellers off the same ladders', () => {
    resetObjectCounter()
    const forOwner = (ownerKey: string) =>
      wordLadderTemplate
        .generate({ ...BASE, seed: 42 }, { ...STUDIO_TEST_CTX, seed: 42, ownerKey })
        .flatMap((page) => flatten(page.objects))
        .filter((obj) => obj.studioRole === 'prompt')
        .map((obj) => obj.text)
        .join('')
    expect(forOwner('user:1')).not.toEqual(forOwner('user:2'))
  })
})

describe('word-ladder AI pairs', () => {
  /** COLD → WARM is four moves apart in the bundled list, with more than one route. */
  const CHAIN = ['COLD', 'CORD', 'WORD', 'WARD', 'WARM']

  function generateWith(
    remote: unknown,
    overrides: Record<string, unknown> = {},
    seed = 42,
  ) {
    resetObjectCounter()
    return wordLadderTemplate.generate(
      { ...BASE, ...overrides, seed },
      { ...STUDIO_TEST_CTX, seed, remoteData: remote },
    )
  }

  it('climbs the chain the model suggested when every rung is a curated word', () => {
    const graph = ladderGraph(4)
    const puzzle = buildLadderForPair({
      graph,
      start: 'COLD',
      target: 'WARM',
      steps: 4,
      level: 'hard',
      rng: createRng(7),
      suggestedPath: CHAIN,
    })
    expect(puzzle?.path).toEqual(CHAIN)
    expect(solutionCount(graph, puzzle!)).toBe(1)
  })

  it('drops a chain the word list cannot vouch for, and solves the pair itself', () => {
    const graph = ladderGraph(4)
    // WOLD is one letter from its neighbours but is not in the curated list, so
    // a reader could not be expected to produce it.
    const puzzle = buildLadderForPair({
      graph,
      start: 'COLD',
      target: 'WARM',
      steps: 4,
      level: 'hard',
      rng: createRng(7),
      suggestedPath: ['COLD', 'WOLD', 'WORD', 'WARD', 'WARM'],
    })
    expect(puzzle).not.toBeNull()
    expect(puzzle!.path).not.toContain('WOLD')
    expect(puzzle!.path[0]).toBe('COLD')
    expect(puzzle!.path[4]).toBe('WARM')
    expect(puzzle!.path.every((word) => graph.isCore(word))).toBe(true)
    expect(solutionCount(graph, puzzle!)).toBe(1)
  })

  it('refuses a pair the dictionary cannot join in exactly that many moves', () => {
    const graph = ladderGraph(4)
    // Three moves apart, so it can be neither stretched nor cut to four.
    for (const steps of [3, 5]) {
      const puzzle = buildLadderForPair({
        graph,
        start: 'MILK',
        target: 'SALT',
        steps,
        level: 'hard',
        rng: createRng(steps),
      })
      if (steps === 3) expect(puzzle).not.toBeNull()
      else expect(puzzle).toBeNull()
    }
  })

  it('prints a model word the curated list lacks, but never on a rung', () => {
    // HAKE is a real word the bundled list does not carry.
    const graph = ladderGraph(4, ['HAKE'])
    expect(graph.isCore('HAKE')).toBe(false)
    const puzzle = buildLadderForPair({
      graph,
      start: 'HAKE',
      target: 'KITE',
      steps: 4,
      level: 'medium',
      rng: createRng(5),
    })
    expect(puzzle?.path[0]).toBe('HAKE')
    expect(puzzle!.path.slice(1).every((word) => graph.isCore(word))).toBe(true)
  })

  it('prints the themed end words on the sheet', () => {
    const [page] = generateWith(
      { pairs: [{ start: 'COLD', target: 'WARM', path: CHAIN }] },
      { wordLength: 4, steps: 4, laddersPerPage: 1 },
    )
    const letters = printedLetters(page!.objects)
    expect(letters).toContain('COLD')
    expect(letters).toContain('WARM')
  })

  it('fills the page from the word list when the model comes back empty', () => {
    const [page] = generateWith({ pairs: [] }, { wordLength: 4, laddersPerPage: 3 })
    expect(page!.objects.filter((obj) => obj.type === 'group')).toHaveLength(3)
  })

  it('still prints a full page when a themed pair does not fit the step count', () => {
    // MILK → SALT is three moves; the sheet asks for four.
    const [page] = generateWith(
      { pairs: [{ start: 'MILK', target: 'SALT', path: [] }] },
      { wordLength: 4, steps: 4, laddersPerPage: 2 },
    )
    expect(page!.objects.filter((obj) => obj.type === 'group')).toHaveLength(2)
  })
})

describe('word-ladder layout', () => {
  it('stays inside the safe margin at every size', () => {
    for (const wordLength of [3, 4, 5]) {
      for (const steps of [3, 4, 5]) {
        for (let ladders = 1; ladders <= maxLaddersFor(wordLength as 3 | 4 | 5); ladders++) {
          for (const showTitle of [false, true]) {
            const pages = generate({
              wordLength,
              steps,
              laddersPerPage: ladders,
              hintLevel: 'easy',
              showTitle,
              title: showTitle ? 'Game 12' : '',
            })
            for (const page of pages) {
              assertObjectsInSafeMargin(page.objects)
              assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects)
            }
          }
        }
      }
    }
  })

  it('centres the ladders in the body, horizontally and vertically', () => {
    for (const laddersPerPage of [1, 2, 3]) {
      const [page] = generate({ wordLength: 4, steps: 4, laddersPerPage })
      const instruction = instructionFor(4, laddersPerPage)
      const content = insetHorizontal(
        contentBox(STUDIO_TEST_CTX),
        STUDIO_CONTENT_SAFE_INSET_X,
      )
      const headerHeight = measureHeaderHeight(
        { ...BASE, title: '' },
        instruction,
        content.width,
      )
      const body = {
        top: content.top + headerHeight,
        bottom: content.top + content.height,
      }
      const groups = page!.objects.filter((obj) => obj.type === 'group')
      const bounds = unionObjectBounds(groups)!
      // 1px of slack: cells snap to whole pixels for crisp strokes.
      expect(
        Math.abs(bounds.top + bounds.height / 2 - (body.top + body.bottom) / 2),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(bounds.left + bounds.width / 2 - (content.left + content.width / 2)),
      ).toBeLessThanOrEqual(1)
    }
  })

  it('draws the requested number of ladders', () => {
    const [page] = generate({ wordLength: 4, laddersPerPage: 3 })
    const groups = page!.objects.filter((obj) => obj.type === 'group')
    expect(groups).toHaveLength(3)
  })

  it('hides one answer letter for every blank the reader must fill', () => {
    const [page] = generate({ wordLength: 4, steps: 4, laddersPerPage: 1, hintLevel: 'hard' })
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
    // Three blank rungs of four letters, minus whatever was given away.
    expect(answers.length).toBeLessThanOrEqual(3 * 4)
  })

  it('prints the solution in black, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(wordLadderTemplate.key)).toBe(true)
  })

  it('keeps the solution page the same size as the puzzle page', () => {
    const [page] = generate({ wordLength: 4, steps: 5, laddersPerPage: 2 })
    const cellOf = (objects: StudioFabricObject[]) =>
      objects.find((obj) => obj.type === 'group')?.width
    expect(cellOf(page!.answerSourceObjects!)).toBe(cellOf(page!.objects))
  })
})
