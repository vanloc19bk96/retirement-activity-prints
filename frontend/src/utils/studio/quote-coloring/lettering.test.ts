import { describe, it, expect } from 'vitest'
import { rasterCheck } from '../stained-glass/raster'
import { pointInRing, pt, type Pt } from '../stained-glass/geometry'
import { QC_INK, QC_LETTER_FLOOR } from './compose'
import { QC_LETTER_STYLES } from './fonts'
import { qcTestFonts } from './fixture'
import { glyphText, layoutLettering, letteredText, readBack, visibleOutline } from './lettering'

const ALPHABET = "ABCDEFGHIJKLM NOPQRSTUVWXYZ abcdefghijklm nopqrstuvwxyz ,.!?'-"
const WIDE = { minX: 0, minY: 0, maxX: 60000, maxY: 2000 }
const limits = (size: number) => ({ minSize: size, maxSize: size, minGapPx: 6, minLineGapPx: 12 })

describe('lettering faces', () => {
  it('every face letters every character the service may send', () => {
    const fonts = qcTestFonts()
    for (const style of QC_LETTER_STYLES) {
      const text = letteredText(ALPHABET, style.caps)
      const l = layoutLettering(fonts[style.id]!, text, WIDE, limits(style.minEm))
      expect(l, style.id).not.toBeNull()
      expect(glyphText(l!)).toBe(text.replace(/ /g, ''))
    }
  })

  // The claim `fonts.ts` makes: at its smallest size and above, at any
  // sub-pixel position, every letter, counter and mark of every face clears
  // the lettering floor with the lettering pen.
  it.each(QC_LETTER_STYLES.map((s) => [s.id, s] as const))('%s is colorable at and above its smallest size', (_id, style) => {
    const font = qcTestFonts()[style.id]!
    const text = letteredText(ALPHABET, style.caps)
    for (const size of [style.minEm, style.minEm + 7, style.minEm + 15]) {
      for (const [dx, dy] of [[0, 0], [0.37, 0.61], [0.73, 0.19], [0.5, 0.5]] as const) {
        const l = layoutLettering(font, text, { minX: dx, minY: dy, maxX: 60000 + dx, maxY: 2000 + dy }, limits(size))!
        const glyphs = l.lines.flatMap((line) => line.glyphs)
        const b = l.bounds
        const report = rasterCheck(
          glyphs.flatMap((g) => g.outline.map((pts) => ({ pts, width: QC_INK.letter }))),
          { minX: b.minX - 10, minY: b.minY - 10, maxX: b.maxX + 10, maxY: b.maxY + 10 },
        )
        for (const region of report.regions) {
          if (region.area <= 24) continue
          const g = glyphs.find((gg) => region.deepest.x >= gg.bounds.minX - 1 && region.deepest.x <= gg.bounds.maxX + 1 && region.deepest.y >= gg.bounds.minY - 1 && region.deepest.y <= gg.bounds.maxY + 1)
          if (!g) continue
          const inside = g.rings.filter((ring) => pointInRing(region.deepest, ring)).length % 2 === 1
          const floor = inside ? (/[A-Za-z]/.test(g.char) ? QC_LETTER_FLOOR.letter : QC_LETTER_FLOOR.punct) : QC_LETTER_FLOOR.counter
          expect(region.width, `${style.id} ${size}px '${g.char}'`).toBeGreaterThanOrEqual(floor)
          expect(region.area, `${style.id} ${size}px '${g.char}'`).toBeGreaterThanOrEqual(QC_LETTER_FLOOR.area)
        }
      }
    }
  }, 60000)
})

describe('lettering layout', () => {
  const font = () => qcTestFonts().classic!

  it('reads back as exactly the saying, one glyph per character', () => {
    const saying = "Who needs Mondays? I've got mornings!"
    const l = layoutLettering(font(), saying, { minX: 0, minY: 0, maxX: 700, maxY: 700 }, { minSize: 76, maxSize: 180, minGapPx: 6, minLineGapPx: 12 })!
    expect(readBack(l)).toBe(saying)
    expect(glyphText(l)).toBe(saying.replace(/ /g, ''))
  })

  it('refuses a character the face has no glyph for, rather than printing a box', () => {
    expect(layoutLettering(font(), 'Tea ☕ time', { minX: 0, minY: 0, maxX: 900, maxY: 900 }, { minSize: 76, maxSize: 180, minGapPx: 6, minLineGapPx: 12 })).toBeNull()
  })

  it('refuses a saying that cannot fit at its smallest size', () => {
    expect(layoutLettering(font(), 'Wandering', { minX: 0, minY: 0, maxX: 200, maxY: 400 }, { minSize: 76, maxSize: 180, minGapPx: 6, minLineGapPx: 12 })).toBeNull()
  })

  it('keeps clear paper between neighbouring letters', () => {
    const l = layoutLettering(font(), 'AVATAR LYTTLE WAVY', { minX: 0, minY: 0, maxX: 5000, maxY: 400 }, { minSize: 80, maxSize: 80, minGapPx: 6, minLineGapPx: 12 })!
    for (const line of l.lines) {
      for (let i = 1; i < line.glyphs.length; i++) {
        const a = line.glyphs[i - 1]!.outline.flat()
        const b = line.glyphs[i]!.outline.flat()
        let best = Infinity
        for (const p of a) for (const q of b) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y))
        // Word spaces are wider still; within a word the outlines never close up.
        expect(best).toBeGreaterThan(QC_INK.letter + 2)
      }
    }
  })

  it('breaks only between words, in balanced lines, and centres them', () => {
    const box = { minX: 100, minY: 100, maxX: 700, maxY: 900 }
    const l = layoutLettering(font(), letteredText('Plant something new each spring', true), box, { minSize: 76, maxSize: 180, minGapPx: 6, minLineGapPx: 12 })!
    expect(l.lines.length).toBeGreaterThan(1)
    expect(l.lines.map((line) => line.text).join(' ')).toBe(letteredText('Plant something new each spring', true))
    for (const line of l.lines) {
      const mid = (line.bounds.minX + line.bounds.maxX) / 2
      expect(Math.abs(mid - 400)).toBeLessThan(1)
      expect(line.bounds.minX).toBeGreaterThanOrEqual(box.minX)
      expect(line.bounds.maxX).toBeLessThanOrEqual(box.maxX)
    }
    expect(l.bounds.minY).toBeGreaterThanOrEqual(box.minY)
    expect(l.bounds.maxY).toBeLessThanOrEqual(box.maxY)
  })

  it('never strands a short word alone on a line when another break works', () => {
    const l = layoutLettering(font(), 'Pack light and wander far', { minX: 0, minY: 0, maxX: 700, maxY: 900 }, { minSize: 76, maxSize: 180, minGapPx: 6, minLineGapPx: 12 })!
    for (const line of l.lines) expect(['AND', 'FAR'].includes(line.text) && l.lines.length > 1).toBe(false)
  })
})

describe('visible outline', () => {
  it('drops the parts of overlapping contours that fall inside the letter', () => {
    // Two overlapping squares, like a crossbar laid over a stem.
    const a = [pt(0, 0), pt(40, 0), pt(40, 40), pt(0, 40)]
    const b = [pt(20, 20), pt(60, 20), pt(60, 60), pt(20, 60)]
    const outline = visibleOutline([a, b])
    const inside = (p: Pt) => p.x > 20.5 && p.x < 39.5 && p.y > 20.5 && p.y < 39.5
    for (const line of outline) {
      for (let i = 1; i < line.length; i++) {
        const mid = pt((line[i - 1]!.x + line[i]!.x) / 2, (line[i - 1]!.y + line[i]!.y) / 2)
        expect(inside(mid)).toBe(false)
      }
    }
  })

  it('keeps a counter, which is an edge between letter and paper', () => {
    const outer = [pt(0, 0), pt(60, 0), pt(60, 60), pt(0, 60)]
    const hole = [pt(20, 20), pt(20, 40), pt(40, 40), pt(40, 20)]
    const length = visibleOutline([outer, hole]).reduce(
      (sum, line) => sum + line.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y), 0),
      0,
    )
    expect(length).toBeCloseTo(240 + 80, 0)
  })
})
