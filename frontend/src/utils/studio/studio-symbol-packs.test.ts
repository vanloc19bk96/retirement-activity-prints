import { describe, expect, it } from 'vitest'
import {
  getAllSymbolItems,
  getSymbolPackItems,
  listSymbolPacks,
} from './studio-symbol-packs'

/** Max Study & Recall grid is 5×5 — mixed pool must cover it without repeats. */
const MIN_MIXED_POOL = 25

describe('studio-symbol-packs', () => {
  it('lists Mixed plus every curated pack with matching counts', () => {
    const packs = listSymbolPacks()
    expect(packs[0]?.key).toBe('mixed')
    expect(packs.length).toBeGreaterThan(1)

    for (const pack of packs) {
      const items = getSymbolPackItems(pack.key)
      expect(items.length).toBe(pack.count)
      expect(new Set(items).size).toBe(items.length)
    }
  })

  it('keeps the mixed pool large enough for a unique 5×5 grid', () => {
    expect(getAllSymbolItems().length).toBeGreaterThanOrEqual(MIN_MIXED_POOL)
  })

  it('exposes a curated mixed pool of basic-shape glyphs', () => {
    const all = getAllSymbolItems()
    // Basic-shape only — smaller than the old broad dump, still rich enough to vary.
    expect(all.length).toBeGreaterThanOrEqual(120)
    expect(all.length).toBeLessThan(250)
    expect(all).toEqual(getSymbolPackItems('mixed'))
  })

  it('excludes non-basic-shape glyphs', () => {
    const bare = getAllSymbolItems().map((g) => g.replace(/\uFE0E/g, ''))
    const banned = [
      // organic / figurative
      '♠',
      '♣',
      '♥',
      '♦',
      '♤',
      '♡',
      '♢',
      '♧',
      '☺',
      '☻',
      '☀',
      '☁',
      '☂',
      '☾',
      '☽',
      '☎',
      '☕',
      '⌚',
      '⛺',
      '⛳',
      // music / roman / circled nums / hard dice
      '♩',
      '♪',
      '♭',
      '♯',
      '♮',
      'Ⅷ',
      '①',
      '⑩',
      '⚂',
      '⚃',
      '⚄',
      '⚅',
      // junctions, mosaics, curved arrows, prose punctuation
      '┌',
      '┼',
      '▀',
      '█',
      '↶',
      '↺',
      '↩',
      '!',
      '?',
      '#',
      '…',
      '‼',
      // fancy math
      '∑',
      '∞',
      'π',
      '½',
      '√',
      '⊂',
      '∪',
    ]
    for (const glyph of banned) {
      expect(bare).not.toContain(glyph)
    }
  })
})
