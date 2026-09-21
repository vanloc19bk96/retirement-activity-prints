/**
 * Word Fit-In — the uniqueness solver.
 *
 * This file is the reason the template is worth shipping. A fill-in built by
 * placing words on a grid always *has* a solution — the one it was built from —
 * but that is not the same as having only one. Two same-length words whose
 * slots share no crossing letter are freely swappable, and the printed answer
 * key is then wrong for every reader who found the other filling. Cheap
 * puzzle books are full of exactly this.
 *
 * So the grid is stripped back to a bare skeleton and re-solved from the bank
 * alone, counting fillings and stopping at the second. Only a puzzle that comes
 * back with a count of one goes to print; the caller reveals a starter word and
 * asks again until it does.
 */

import type { WordFitCrossing, WordFitSlot } from './types'

/** Second solution is all we need — nothing calls for the third. */
const SOLUTION_LIMIT = 2

export interface SolveInput {
  slots: readonly WordFitSlot[]
  crossings: readonly WordFitCrossing[]
  words: readonly string[]
  /** `slotId -> word index`, for slots printed already filled in. */
  fixed: ReadonlyMap<number, number>
}

interface CrossingRef {
  /** Position in this slot. */
  self: number
  other: number
  otherAt: number
}

function crossingIndex(input: SolveInput): Map<number, CrossingRef[]> {
  const index = new Map<number, CrossingRef[]>()
  const push = (slot: number, ref: CrossingRef): void => {
    index.set(slot, [...(index.get(slot) ?? []), ref])
  }
  for (const crossing of input.crossings) {
    push(crossing.a, { self: crossing.ai, other: crossing.b, otherAt: crossing.bi })
    push(crossing.b, { self: crossing.bi, other: crossing.a, otherAt: crossing.ai })
  }
  return index
}

/**
 * How many ways the bank fills the skeleton, capped at two.
 *
 * Slots are taken most-constrained first — fewest candidate words, then most
 * crossings — which is what keeps the search in the millisecond range instead
 * of walking a factorial. Each word is used exactly once, and every crossing
 * must agree letter for letter.
 */
export function countFillings(input: SolveInput): number {
  const { slots, words, fixed } = input
  const crossings = crossingIndex(input)

  const candidates = new Map<number, number[]>()
  for (const slot of slots) {
    const pinned = fixed.get(slot.id)
    if (pinned !== undefined) {
      candidates.set(slot.id, [pinned])
      continue
    }
    candidates.set(
      slot.id,
      words
        .map((word, index) => ({ word, index }))
        .filter(({ word }) => word.length === slot.length)
        .map(({ index }) => index),
    )
  }

  // A slot with nothing to put in it, or a bank entry that fits nowhere, means
  // the skeleton and the bank do not match at all.
  if (slots.some((slot) => (candidates.get(slot.id) ?? []).length === 0)) return 0

  const order = [...slots].sort((a, b) => {
    const byCandidates =
      (candidates.get(a.id) ?? []).length - (candidates.get(b.id) ?? []).length
    if (byCandidates !== 0) return byCandidates
    const byCrossings = (crossings.get(b.id) ?? []).length - (crossings.get(a.id) ?? []).length
    if (byCrossings !== 0) return byCrossings
    return a.id - b.id
  })

  const assigned = new Map<number, number>()
  const usedWord = new Set<number>()
  let found = 0

  const fits = (slot: WordFitSlot, wordIndex: number): boolean => {
    const word = words[wordIndex]!
    for (const ref of crossings.get(slot.id) ?? []) {
      const otherWordIndex = assigned.get(ref.other)
      if (otherWordIndex === undefined) continue
      if (word[ref.self] !== words[otherWordIndex]![ref.otherAt]) return false
    }
    return true
  }

  const walk = (depth: number): void => {
    if (found >= SOLUTION_LIMIT) return
    if (depth === order.length) {
      found++
      return
    }
    const slot = order[depth]!
    for (const wordIndex of candidates.get(slot.id) ?? []) {
      if (usedWord.has(wordIndex)) continue
      if (!fits(slot, wordIndex)) continue
      assigned.set(slot.id, wordIndex)
      usedWord.add(wordIndex)
      walk(depth + 1)
      assigned.delete(slot.id)
      usedWord.delete(wordIndex)
      if (found >= SOLUTION_LIMIT) return
    }
  }

  walk(0)
  return found
}

/**
 * The slot worth printing as a starter next.
 *
 * Revealing a word only removes ambiguity if that word was *part* of the
 * ambiguity, so the pick goes to the slot with the most rivals — other unfixed
 * slots of the same length — and, among those, the one carrying the most
 * crossings, since every crossing it pins constrains a second slot for free.
 */
export function nextStarterSlot(input: SolveInput): WordFitSlot | null {
  const crossings = crossingIndex(input)
  const open = input.slots.filter((slot) => !input.fixed.has(slot.id))
  if (open.length === 0) return null

  const rivals = (slot: WordFitSlot): number =>
    open.filter((other) => other.id !== slot.id && other.length === slot.length).length

  return [...open].sort((a, b) => {
    const byRivals = rivals(b) - rivals(a)
    if (byRivals !== 0) return byRivals
    const byCrossings = (crossings.get(b.id) ?? []).length - (crossings.get(a.id) ?? []).length
    if (byCrossings !== 0) return byCrossings
    return a.id - b.id
  })[0]!
}
