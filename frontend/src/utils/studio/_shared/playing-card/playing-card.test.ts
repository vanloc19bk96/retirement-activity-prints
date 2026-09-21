import { describe, it, expect } from 'vitest'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { resetObjectCounter, type StudioTag } from '../../studio-fabric-builders'
import { objectExtent } from '../../studio-object-bounds'
import {
  MIN_INDEX_PX,
  MIN_STROKE_PX,
  RANKS,
  SUITS,
  cardIndex,
  cardFromIndex,
  cardWidthForSize,
  isRedSuit,
} from './types'
import {
  buildDecoys,
  cardsMissingFrom,
  deal,
  rankSubset,
  standardDeck,
  suitRun,
} from './deck'
import {
  MIN_CARD_WIDTH_PX,
  PIP_LAYOUT,
  cardMetrics,
  courtPipCenters,
  deckPipSize,
  pipCenters,
  pipFieldSlack,
  pipSizeForRank,
} from './geometry'
import { suitGlyph, suitPolygons } from './suits'
import {
  renderBlankCard,
  renderCard,
  renderCardBack,
  renderCardWriteLabel,
  renderPartialCard,
} from './render'
import { arrangeCards, bestColumnCount } from './layout'
import { createRngFromBytes } from '../uniqueness/seed'

const TAG: StudioTag = {
  templateKey: 'card-test',
  instanceId: 'test-run',
  pageRole: 'single',
}

const rng = () => createRngFromBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))

function flatten(obj: StudioFabricObject): StudioFabricObject[] {
  return obj.objects ? [obj, ...obj.objects.flatMap(flatten)] : [obj]
}

describe('deck', () => {
  it('holds 52 distinct cards and no jokers', () => {
    const deck = standardDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map(cardIndex)).size).toBe(52)
    expect(deck.every((c) => c.rank >= 1 && c.rank <= 13)).toBe(true)
  })

  it('round-trips a card through its index', () => {
    for (const card of standardDeck()) {
      expect(cardFromIndex(cardIndex(card))).toEqual(card)
    }
  })

  it('rankSubset returns k distinct ranks in ascending order', () => {
    const r = rng()
    for (let i = 0; i < 200; i++) {
      const ranks = rankSubset(r, 4)
      expect(ranks).toHaveLength(4)
      expect(new Set(ranks).size).toBe(4)
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  it('cardsMissingFrom is exactly the set difference', () => {
    const full = suitRun(0)
    const shown = full.filter((_, i) => i % 3 !== 0)
    const missing = cardsMissingFrom(full, shown)
    expect(missing).toHaveLength(full.length - shown.length)
    expect(missing.every((m) => !shown.some((s) => cardIndex(s) === cardIndex(m)))).toBe(true)
  })

  it('decoys never repeat a studied card and never repeat each other', () => {
    const r = rng()
    for (let i = 0; i < 100; i++) {
      const studied = deal(r, 12)
      const decoys = buildDecoys(r, studied, 12)
      expect(decoys).toHaveLength(12)
      const studiedIndices = new Set(studied.map(cardIndex))
      expect(decoys.some((d) => studiedIndices.has(cardIndex(d)))).toBe(false)
      expect(new Set(decoys.map(cardIndex)).size).toBe(12)
    }
  })

  it('decoys are mostly near-misses, not random cards', () => {
    const r = rng()
    let nearMiss = 0
    let total = 0
    for (let i = 0; i < 60; i++) {
      const studied = deal(r, 9)
      for (const decoy of buildDecoys(r, studied, 9)) {
        total++
        const shareRank = studied.some((s) => s.rank === decoy.rank)
        const nearRank = studied.some(
          (s) =>
            s.suit === decoy.suit &&
            (Math.abs(s.rank - decoy.rank) === 1 || Math.abs(s.rank - decoy.rank) === 12),
        )
        if (shareRank || nearRank) nearMiss++
      }
    }
    // The mix is 50/30/20; the unrelated fifth sometimes lands on a near-miss
    // anyway, so the floor is well under the nominal 80%.
    expect(nearMiss / total).toBeGreaterThan(0.7)
  })
})

describe('geometry', () => {
  it('tables a pip layout for every non-court rank', () => {
    for (const rank of RANKS) {
      if (rank >= 11) continue
      expect(PIP_LAYOUT[rank]).toBeDefined()
      expect(PIP_LAYOUT[rank]).toHaveLength(rank)
    }
  })

  it('never overlaps two pips on any rank at any size', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const metrics = cardMetrics(cardWidthForSize(size), 1)
      for (const rank of RANKS) {
        if (rank >= 11) continue
        const pipHeight = pipSizeForRank(rank, metrics)
        const pipWidth = pipHeight * Math.max(...SUITS.map((s) => suitGlyph(s).aspect))
        const centers = pipCenters(rank, metrics)
        for (let i = 0; i < centers.length; i++) {
          for (let j = i + 1; j < centers.length; j++) {
            const dx = Math.abs(centers[i].x - centers[j].x)
            const dy = Math.abs(centers[i].y - centers[j].y)
            expect(dx >= pipWidth || dy >= pipHeight).toBe(true)
          }
        }
      }
    }
  })

  it('keeps every pip inside the card box', () => {
    const metrics = cardMetrics(cardWidthForSize('S'), 1)
    for (const rank of RANKS) {
      if (rank >= 11) continue
      const size = pipSizeForRank(rank, metrics)
      for (const pip of pipCenters(rank, metrics)) {
        expect(pip.x - size / 2).toBeGreaterThan(0)
        expect(pip.x + size / 2).toBeLessThan(metrics.width)
        expect(pip.y - size / 2).toBeGreaterThan(0)
        expect(pip.y + size / 2).toBeLessThan(metrics.height)
      }
    }
  })

  it('holds the 12pt corner-index floor at the smallest card size', () => {
    const metrics = cardMetrics(cardWidthForSize('S'), 1)
    expect(metrics.indexFontSize).toBeGreaterThanOrEqual(MIN_INDEX_PX)
    expect(metrics.indexWideFontSize).toBeGreaterThanOrEqual(MIN_INDEX_PX)
  })

  it('leaves a printable pip in the field at every size preset', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      expect(pipFieldSlack(cardWidthForSize(size))).toBeGreaterThanOrEqual(0)
    }
    expect(pipFieldSlack(MIN_CARD_WIDTH_PX)).toBeGreaterThanOrEqual(0)
    expect(pipFieldSlack(MIN_CARD_WIDTH_PX - 2)).toBeLessThan(0)
  })

  it('keeps the pip columns clear of the corner index at every size', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const metrics = cardMetrics(cardWidthForSize(size), 1)
      const pipHalfWidth =
        (deckPipSize(metrics) * Math.max(...SUITS.map((s) => suitGlyph(s).aspect))) / 2
      const indexRight = metrics.indexCenterX + metrics.indexColumnHalfWidth
      expect(metrics.pipField.left - pipHalfWidth).toBeGreaterThan(indexRight)
    }
  })

  it('draws 2 through 10 at one pip size, so a mixed spread reads as one deck', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const metrics = cardMetrics(cardWidthForSize(size), 1)
      const sizes = new Set(
        RANKS.filter((r) => r >= 2 && r <= 10).map((r) => pipSizeForRank(r, metrics)),
      )
      expect(sizes.size).toBe(1)
      // The Ace's display pip is the deliberate exception.
      expect(pipSizeForRank(1, metrics)).toBeGreaterThan(deckPipSize(metrics))
    }
  })

  it('spreads the pip columns wider as the index stops dominating the width', () => {
    const share = (size: 'S' | 'M' | 'L') => {
      const width = cardWidthForSize(size)
      return cardMetrics(width, 1).pipField.left / width
    }
    expect(share('L')).toBeLessThan(share('M'))
    expect(share('M')).toBeLessThan(share('S'))
  })

  it('puts the legibility floor at or below the smallest size preset', () => {
    expect(MIN_CARD_WIDTH_PX).toBeLessThanOrEqual(cardWidthForSize('S'))
    // Floor sits below S once the face has air from the border; still a real
    // collision threshold, not an arbitrary tiny number.
    expect(MIN_CARD_WIDTH_PX).toBeGreaterThan(cardWidthForSize('S') * 0.5)
  })

  it('floors the border at the print-safe stroke width', () => {
    expect(cardMetrics(100, 0.1).borderWidth).toBe(MIN_STROKE_PX)
    expect(cardMetrics(100, 2).borderWidth).toBeGreaterThan(MIN_STROKE_PX)
  })
})

describe('suit artwork', () => {
  it('draws every suit inside the unit box', () => {
    for (const suit of SUITS) {
      const glyph = suitGlyph(suit)
      for (const points of [glyph.blob, glyph.stem ?? []]) {
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(1)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(1)
        }
      }
      expect(glyph.aspect).toBeGreaterThan(0.5)
      expect(glyph.aspect).toBeLessThan(1.6)
    }
  })

  it('gives spades and clubs a stem, hearts and diamonds a single lobe', () => {
    expect(suitGlyph(0).stem).toBeDefined()
    expect(suitGlyph(3).stem).toBeDefined()
    expect(suitGlyph(1).stem).toBeUndefined()
    expect(suitGlyph(2).stem).toBeUndefined()
  })

  it('centres a scaled suit mark on the requested point', () => {
    for (const suit of SUITS) {
      const polys = suitPolygons(suit, 100, 200, 40)
      const xs = polys.flat().map((p) => p.x)
      const ys = polys.flat().map((p) => p.y)
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100, 0)
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(200, 0)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40, 0)
    }
  })

  it('places the two court pips symmetrically about the card centre', () => {
    const metrics = cardMetrics(cardWidthForSize('M'), 1)
    const [topPip, bottomPip] = courtPipCenters(metrics)
    expect(topPip.x).toBeCloseTo(metrics.width / 2, 5)
    expect(bottomPip.x).toBeCloseTo(metrics.width / 2, 5)
    expect(topPip.y + bottomPip.y).toBeCloseTo(metrics.height, 5)
    expect(bottomPip.rotated).toBe(true)
  })
})

describe('renderer', () => {
  const width = cardWidthForSize('M')

  it('renders every card in the deck without throwing', () => {
    resetObjectCounter()
    for (const card of standardDeck()) {
      expect(() =>
        renderCard(card, { left: 0, top: 0, width, tag: TAG }),
      ).not.toThrow()
    }
  })

  it('keeps every card face inside its own box, border stroke aside', () => {
    resetObjectCounter()
    const slack = cardMetrics(width, 1).borderWidth
    for (const card of standardDeck()) {
      const group = renderCard(card, { left: 40, top: 60, width, tag: TAG })
      const extent = objectExtent(group)
      expect(extent.left).toBeGreaterThanOrEqual(40 - slack)
      expect(extent.top).toBeGreaterThanOrEqual(60 - slack)
      expect(extent.right).toBeLessThanOrEqual(40 + width + slack)
      expect(extent.bottom).toBeLessThanOrEqual(60 + width / (5 / 7) + slack)
    }
  })

  it('draws one pip per rank value, plus both corner indices', () => {
    resetObjectCounter()
    // A 7 of diamonds: diamonds are a single polygon, so pip polygons == 7,
    // and each corner index adds one more.
    const group = renderCard({ rank: 7, suit: 2 }, { left: 0, top: 0, width, tag: TAG })
    const polygons = flatten(group).filter((o) => o.type === 'polygon')
    expect(polygons).toHaveLength(7 + 2)
    const texts = flatten(group).filter((o) => o.type === 'textbox')
    expect(texts.map((t) => t.text)).toEqual(['7', '7'])
  })

  it('keeps the wide "10" corner index clear of the left pip column', () => {
    resetObjectCounter()
    for (const size of ['S', 'M', 'L'] as const) {
      const cardWidth = cardWidthForSize(size)
      const metrics = cardMetrics(cardWidth, 1)
      const group = renderCard(
        { rank: 10, suit: 1 },
        { left: 0, top: 0, width: cardWidth, tag: TAG },
      )
      const topLeftTen = flatten(group).find(
        (o) => o.type === 'textbox' && o.text === '10' && (o.angle ?? 0) === 0,
      )
      expect(topLeftTen).toBeDefined()
      const indexRight = (topLeftTen!.left ?? 0) + (topLeftTen!.width ?? 0) / 2
      const pipLeft =
        metrics.pipField.left -
        (deckPipSize(metrics) * Math.max(...SUITS.map((s) => suitGlyph(s).aspect))) / 2
      expect(indexRight).toBeLessThan(pipLeft)
    }
  })

  it('prints hearts and diamonds as outlines and black suits solid', () => {
    resetObjectCounter()
    for (const suit of SUITS) {
      const group = renderCard({ rank: 5, suit }, { left: 0, top: 0, width, tag: TAG })
      const pip = flatten(group).find((o) => o.type === 'polygon')!
      if (isRedSuit(suit)) {
        expect(pip.fill).toBe('transparent')
        expect(pip.strokeWidth).toBeGreaterThanOrEqual(MIN_STROKE_PX)
      } else {
        expect(pip.fill).toBe('#000000')
      }
    }
  })

  it('honours the gray35 red-suit option', () => {
    resetObjectCounter()
    const group = renderCard(
      { rank: 5, suit: 1 },
      { left: 0, top: 0, width, tag: TAG, style: { redSuitStyle: 'gray35' } },
    )
    expect(flatten(group).find((o) => o.type === 'polygon')!.fill).toBe('#A6A6A6')
  })

  it('draws court cards as a rank letter between two suit pips, never a figure', () => {
    resetObjectCounter()
    for (const rank of [11, 12, 13] as const) {
      const group = renderCard({ rank, suit: 0 }, { left: 0, top: 0, width, tag: TAG })
      const parts = flatten(group)
      // Two face pips + two corner marks, each a spade lobe plus its stem.
      expect(parts.filter((o) => o.type === 'polygon').length).toBe(4 + 4)
      const letter = { 11: 'J', 12: 'Q', 13: 'K' }[rank]
      expect(parts.filter((o) => o.type === 'textbox').map((o) => o.text)).toEqual(
        Array(3).fill(letter),
      )
    }
  })

  it('shows the suit on the face of a court card, not only in the corners', () => {
    resetObjectCounter()
    for (const rank of [11, 12, 13] as const) {
      const metrics = cardMetrics(width, 1)
      const group = renderCard({ rank, suit: 2 }, { left: 0, top: 0, width, tag: TAG })
      const facePips = flatten(group).filter(
        (o) => o.type === 'polygon' && (o.height ?? 0) > metrics.indexSuitSize,
      )
      expect(facePips).toHaveLength(2)
    }
  })

  it('renders partial clues with one half of the identity', () => {
    resetObjectCounter()
    const rankOnly = flatten(renderPartialCard({ rank: 9 }, { left: 0, top: 0, width, tag: TAG }))
    expect(rankOnly.filter((o) => o.type === 'polygon')).toHaveLength(0)
    expect(rankOnly.filter((o) => o.type === 'textbox').map((o) => o.text)).toEqual(['9', '9', '9'])

    const suitOnly = flatten(renderPartialCard({ suit: 1 }, { left: 0, top: 0, width, tag: TAG }))
    expect(suitOnly.filter((o) => o.type === 'textbox')).toHaveLength(0)
    expect(suitOnly.filter((o) => o.type === 'polygon').length).toBeGreaterThan(0)
  })

  it('renders a blank write-in card as a border and nothing else', () => {
    resetObjectCounter()
    const parts = flatten(renderBlankCard({ left: 0, top: 0, width, tag: TAG }))
    expect(parts.filter((o) => o.type === 'rect')).toHaveLength(1)
    expect(parts.filter((o) => o.type === 'textbox')).toHaveLength(0)
  })

  it('write labels use a rank letter and vector suit, never Unicode glyphs', () => {
    resetObjectCounter()
    for (const suit of SUITS) {
      const parts = renderCardWriteLabel(
        { rank: 4, suit },
        { left: 0, width: 80, baseline: 40, fontSize: 18, tag: TAG },
      )
      const texts = parts.filter((o) => o.type === 'textbox')
      expect(texts).toHaveLength(1)
      expect(texts[0].text).toBe('4')
      expect(parts.some((o) => o.type === 'polygon')).toBe(true)
      expect(texts.every((o) => !/[♠♥♦♣]/.test(String(o.text ?? '')))).toBe(true)
    }
  })

  it('hatches the card back inside its inner border', () => {
    resetObjectCounter()
    const back = renderCardBack({ left: 10, top: 20, width, tag: TAG })
    const parts = flatten(back)
    const lines = parts.filter((o) => o.type === 'line')
    expect(lines.length).toBeGreaterThan(8)
    // Fabric stores group children relative to the group centre.
    const cx = back.left + back.width! / 2
    const cy = back.top + back.height! / 2
    const height = width / (5 / 7)
    for (const line of lines) {
      expect(cx + Math.min(line.x1!, line.x2!)).toBeGreaterThanOrEqual(10)
      expect(cx + Math.max(line.x1!, line.x2!)).toBeLessThanOrEqual(10 + width)
      expect(cy + Math.min(line.y1!, line.y2!)).toBeGreaterThanOrEqual(20)
      expect(cy + Math.max(line.y1!, line.y2!)).toBeLessThanOrEqual(20 + height)
    }
  })

  it('never emits a stroke below the print floor', () => {
    resetObjectCounter()
    for (const card of standardDeck()) {
      for (const part of flatten(renderCard(card, { left: 0, top: 0, width, tag: TAG }))) {
        if (!part.strokeWidth) continue
        expect(part.strokeWidth).toBeGreaterThanOrEqual(MIN_STROKE_PX)
      }
    }
  })

  it('is deterministic for the same card and style', () => {
    resetObjectCounter()
    const a = renderCard({ rank: 10, suit: 3 }, { left: 0, top: 0, width, tag: TAG })
    resetObjectCounter()
    const b = renderCard({ rank: 10, suit: 3 }, { left: 0, top: 0, width, tag: TAG })
    expect(a).toEqual(b)
  })
})

describe('arrangeCards', () => {
  const field = { left: 0, top: 0, width: 480, height: 620 }

  it('lays a grid inside the field', () => {
    const { slots, bounds } = arrangeCards({ field, count: 12 })
    expect(slots).toHaveLength(12)
    expect(bounds.left).toBeGreaterThanOrEqual(field.left - 0.01)
    expect(bounds.top).toBeGreaterThanOrEqual(field.top - 0.01)
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(field.left + field.width + 0.01)
    expect(bounds.top + bounds.height).toBeLessThanOrEqual(field.top + field.height + 0.01)
  })

  it('never overlaps two slots in a grid', () => {
    const { slots } = arrangeCards({ field, count: 16 })
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]
        const b = slots[j]
        const separated =
          a.left + a.width <= b.left + 0.01 ||
          b.left + b.width <= a.left + 0.01 ||
          a.top + a.height <= b.top + 0.01 ||
          b.top + b.height <= a.top + 0.01
        expect(separated).toBe(true)
      }
    }
  })

  it('keeps the 5:7 aspect at every count', () => {
    for (let count = 1; count <= 20; count++) {
      const { cardWidth, cardHeight } = arrangeCards({ field, count })
      expect(cardWidth / cardHeight).toBeCloseTo(5 / 7, 5)
    }
  })

  it('respects a card-size ceiling', () => {
    const max = cardWidthForSize('S')
    const { cardWidth } = arrangeCards({ field, count: 4, maxCardWidth: max })
    expect(cardWidth).toBeLessThanOrEqual(max)
  })

  it('refuses to print below the legible card floor', () => {
    expect(() =>
      arrangeCards({ field: { left: 0, top: 0, width: 200, height: 120 }, count: 24 }),
    ).toThrow(/print floor/)
  })

  it('picks a column count that maximises card size', () => {
    expect(bestColumnCount(field, 4)).toBe(2)
    expect(bestColumnCount({ left: 0, top: 0, width: 600, height: 120 }, 4)).toBe(4)
  })

  it('centres a short final row only in spread mode', () => {
    const grid = arrangeCards({ field, count: 5, cols: 3, mode: 'grid' })
    const spread = arrangeCards({ field, count: 5, cols: 3, mode: 'spread' })
    expect(grid.slots[3].left).toBeCloseTo(grid.slots[0].left, 5)
    expect(spread.slots[3].left).toBeGreaterThan(spread.slots[0].left)
  })

  it('honours minGapRatio instead of collapsing to the default floor', () => {
    const tight = { left: 0, top: 0, width: 320, height: 420 }
    const minGapRatio = 0.18
    const { slots, cardWidth } = arrangeCards({
      field: tight,
      count: 9,
      cols: 3,
      gapRatio: 0.18,
      rowGapRatio: 0.18,
      minGapRatio,
      maxCardWidth: cardWidthForSize('M'),
    })
    const gap = slots[1].left - (slots[0].left + slots[0].width)
    expect(gap / cardWidth).toBeGreaterThanOrEqual(minGapRatio - 0.001)
  })
})
