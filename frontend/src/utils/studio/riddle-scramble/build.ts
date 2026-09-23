import type { RiddleScrambleRiddle } from '@/types/studio-riddle-scramble.types'
import { createRng, deriveSeed, type StudioRng } from '../studio-rng'
import {
  isDictionaryWord,
  loadAnagramIndex,
  scrambleWord,
  sortedKey,
  type AnagramIndex,
} from '../retirement-anagram/scramble'
import { givesWordAway, type RiddleScrambleCandidate } from './content'
import type { RiddleScrambleLevel } from './levels'

/**
 * Turning a riddle and a word pool into a page that cannot lie to its reader.
 *
 * The whole game is one chain: unscramble every word, read the marked letter
 * out of each, and those letters in row order spell the riddle's answer. The
 * chain is what makes the page worth solving and it is also the only thing
 * that can be wrong about it — a reader who unscrambles all six words
 * correctly and is handed six letters that spell nothing has been sold a
 * defective book, and no amount of good typesetting repairs that.
 *
 * Which is why the arithmetic happens here and not in the prompt. A language
 * model asked for "five words whose marked letters spell NAPS" returns five
 * words that do not, confidently. So the service writes riddles and it writes
 * themed words, and this module does the only part that has to be exact: find
 * one word per answer letter that actually contains that letter, mark where,
 * and shuffle each word into letters that cannot be read as anything else.
 *
 * When it cannot, it says so. A page is not printed on a riddle whose answer
 * the pool could not spell.
 */

/** One printed row: the letters as shuffled, the clue, and the marked slot. */
export interface RiddleScrambleRow {
  word: string
  clue: string
  scrambled: string
  /** Index into `word` of the letter that feeds the riddle answer. */
  markIndex: number
}

export interface RiddleScramblePuzzle {
  riddle: string
  /** What the marked letters spell, read down the page. */
  answer: string
  /** One row per answer letter, in the order the answer is read. */
  rows: RiddleScrambleRow[]
}

/** How many shuffles a row may be offered before it settles for the first. */
const SCRAMBLE_ATTEMPTS = 24

/**
 * Words this riddle may be spelled from.
 *
 * Three of these four rejections are about leaks rather than about fit. A word
 * that *is* the answer, shares its letters, or contains it prints the solution
 * halfway up the page; a clue carrying the answer does the same more quietly.
 * The fourth — a riddle that names one of its own words — costs the row its
 * puzzle, because the solver reads the word before unscrambling it.
 */
function poolForRiddle(
  words: readonly RiddleScrambleCandidate[],
  riddle: RiddleScrambleRiddle,
): RiddleScrambleCandidate[] {
  const { answer, riddle: text } = riddle
  const answerKey = sortedKey(answer)
  return words.filter((candidate) => {
    const { word, clue } = candidate
    if (word === answer) return false
    if (word.includes(answer) || answer.includes(word)) return false
    if (sortedKey(word) === answerKey) return false
    if (givesWordAway(clue, answer)) return false
    return !givesWordAway(text, word)
  })
}

/**
 * One word per answer letter, each containing the letter it stands for.
 *
 * This is a bipartite matching, not a greedy walk, and the difference is not
 * academic. Taking the first word that carries each letter in turn strands the
 * last slot often enough to matter: the only word in the pool holding a K gets
 * spent on an earlier row that had four other options, and a riddle the pool
 * could perfectly well spell is thrown away. Kuhn's algorithm re-seats the
 * earlier rows instead of giving up, so a match is found whenever one exists.
 *
 * Returns one pool index per answer letter, or null when no perfect match is
 * possible — the caller then tries the next riddle rather than printing a page
 * whose letters spell something other than its own answer.
 */
function matchLettersToWords(
  answer: string,
  pool: readonly RiddleScrambleCandidate[],
): number[] | null {
  const slotOfWord = new Array<number>(pool.length).fill(-1)
  const wordOfSlot = new Array<number>(answer.length).fill(-1)

  const seat = (slot: number, visited: boolean[]): boolean => {
    for (let w = 0; w < pool.length; w++) {
      if (visited[w]) continue
      if (!pool[w]!.word.includes(answer[slot]!)) continue
      visited[w] = true
      if (slotOfWord[w] === -1 || seat(slotOfWord[w]!, visited)) {
        slotOfWord[w] = slot
        wordOfSlot[slot] = w
        return true
      }
    }
    return false
  }

  for (let slot = 0; slot < answer.length; slot++) {
    if (!seat(slot, new Array<boolean>(pool.length).fill(false))) return null
  }
  return wordOfSlot
}

/**
 * Which occurrence of the letter to mark, when a word holds it more than once.
 *
 * Spread across the rows on purpose. Every mark is a valid puzzle wherever it
 * sits, but a page whose boxes all land in the first column reads as a
 * decorated left margin rather than as a mechanism, and it invites a reader to
 * assume the rule is "always the first letter" — which is wrong on the very
 * next page. So an occurrence at a column the page has not used yet wins, and
 * the seeded draw only breaks the tie.
 */
function chooseMarkIndex(
  word: string,
  letter: string,
  usedColumns: Map<number, number>,
  rng: StudioRng,
): number {
  const occurrences: number[] = []
  for (let i = 0; i < word.length; i++) {
    if (word[i] === letter) occurrences.push(i)
  }
  if (occurrences.length === 0) return -1

  let best = Number.POSITIVE_INFINITY
  const leastUsed: number[] = []
  for (const index of occurrences) {
    const count = usedColumns.get(index) ?? 0
    if (count < best) {
      best = count
      leastUsed.length = 0
    }
    if (count === best) leastUsed.push(index)
  }
  return rng.pick(leastUsed)
}

/**
 * Shuffle one word into the letters the page prints.
 *
 * A shuffle is rejected while it still reads as the word, repeats a scramble
 * already on the page, or spells some other dictionary word: a solver handed
 * SILENT for LISTEN has been given a wrong answer in the prompt, and here that
 * wrong answer also poisons a letter of the riddle.
 */
function shuffleRow(options: {
  word: string
  rowIndex: number
  answer: string
  seed: number
  index: AnagramIndex
  used: Set<string>
  deranged: boolean
}): string {
  const { word, rowIndex, answer, seed, index, used, deranged } = options
  let fallback = ''

  for (let attempt = 0; attempt < SCRAMBLE_ATTEMPTS; attempt++) {
    const rng = createRng(
      deriveSeed(seed, `riddle-scramble:${answer}:${rowIndex}:${attempt}`),
    )
    const { scrambled } = scrambleWord(word, index, rng, {
      preferDerangement: deranged,
    })
    if (scrambled === word || used.has(scrambled)) continue
    // Keep the first usable shuffle in case every remaining one also spells a
    // word — an unused permutation always beats printing the answer.
    if (!fallback) fallback = scrambled
    if (isDictionaryWord(scrambled, index)) continue
    return scrambled
  }
  return fallback || word
}

export interface BuildRiddleScrambleOptions {
  riddles: readonly RiddleScrambleRiddle[]
  words: readonly RiddleScrambleCandidate[]
  level: RiddleScrambleLevel
  seed: number
  index?: AnagramIndex
}

/**
 * The first riddle this word pool can honestly spell, laid out as rows.
 *
 * Candidates are tried in the order the writer sent them, and the words are
 * shuffled per riddle from the sheet's own seed — so two sheets on one theme
 * reach for different words, while the same sheet always redraws identically.
 *
 * Null means the pool spelled none of the riddles. That is a content failure,
 * not a layout one, and the caller reports it rather than printing a page.
 */
export function buildRiddleScramblePuzzle(
  options: BuildRiddleScrambleOptions,
): RiddleScramblePuzzle | null {
  const { riddles, words, level, seed } = options
  const index = options.index ?? loadAnagramIndex()

  for (const riddle of riddles) {
    const pool = poolForRiddle(words, riddle)
    if (pool.length < level.answerLetters) continue

    // Shuffled per riddle, so a second sheet on this theme reaches for
    // different words rather than re-printing the first one's page.
    const shuffled = createRng(
      deriveSeed(seed, `riddle-scramble:pool:${riddle.answer}`),
    ).shuffle(pool)

    const seated = matchLettersToWords(riddle.answer, shuffled)
    if (!seated) continue

    const usedColumns = new Map<number, number>()
    const usedScrambles = new Set<string>()
    const rows: RiddleScrambleRow[] = []

    for (let slot = 0; slot < riddle.answer.length; slot++) {
      const candidate = shuffled[seated[slot]!]!
      const letter = riddle.answer[slot]!
      const markRng = createRng(
        deriveSeed(seed, `riddle-scramble:mark:${riddle.answer}:${slot}`),
      )
      const markIndex = chooseMarkIndex(candidate.word, letter, usedColumns, markRng)
      if (markIndex < 0) break
      usedColumns.set(markIndex, (usedColumns.get(markIndex) ?? 0) + 1)

      const scrambled = shuffleRow({
        word: candidate.word,
        rowIndex: slot,
        answer: riddle.answer,
        seed,
        index,
        used: usedScrambles,
        deranged: level.deranged,
      })
      usedScrambles.add(scrambled)
      rows.push({
        word: candidate.word,
        clue: candidate.clue,
        scrambled,
        markIndex,
      })
    }

    if (rows.length !== riddle.answer.length) continue
    return { riddle: riddle.riddle, answer: riddle.answer, rows }
  }

  return null
}

/** What the marked letters actually spell, read down the printed rows. */
export function markedLetters(rows: readonly RiddleScrambleRow[]): string {
  return rows.map((row) => row.word[row.markIndex] ?? '').join('')
}
