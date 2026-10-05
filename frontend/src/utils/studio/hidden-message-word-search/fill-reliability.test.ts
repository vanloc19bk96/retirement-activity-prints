import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { calculateMarginGuide } from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { hiddenMessageWordSearchTemplate as def } from './generate'

/**
 * A wider, longer-leaning vocabulary than the fixture, closer to what the writer
 * really sends: plenty of six- to eight-letter words and few four-letter ones,
 * which is the pool that used to close a small grid one word short.
 */
const WORDS = `garden travel cruise family hobby relax sunset friends nature reading sailing
freedom journey weekend picnic social outing comfort leisure memory pension hammock book walk
lake bird rose sofa golf fish boat yard knit quilt porch shade peace smile bench ramble cottage
harbor meadow orchard sunrise vacation holiday laughter blessing kindness wisdom stories camping
fishing hiking biking dancing singing painting baking cooking puzzles children retired mentor
legacy pottery coffee teapot slippers armchair blanket fireside mornings evenings sunshine
breeze seaside island village country mountain valley river canoe kayak trail compass postcard
passport luggage suitcase airport railway explore wander venture`.split(/\s+/)

const SAYINGS = [
  'EVERY DAY IS SATURDAY NOW',
  'NO MORE MONDAYS FOR YOU',
  'YOUR NEXT ADVENTURE STARTS TODAY',
  'RELAX AND ENJOY EVERY SUNSET',
  'WORK IS DONE LIFE BEGINS',
  'NOW THE FUN TRULY BEGINS',
  'SLEEP IN AND SMILE OFTEN',
  'HAPPY TRAILS DEAR FRIEND',
]

const DPI = 96

function pageCtx(wIn: number, hIn: number) {
  const pageWidth = Math.round(wIn * DPI)
  const pageHeight = Math.round(hIn * DPI)
  const margin = resolveStudioMarginForPage({
    pageIndex: 0,
    pageWidth,
    pageHeight,
    marginGuide: calculateMarginGuide(100, false),
  })
  return { pageWidth, pageHeight, margin }
}

describe('hidden message fill reliability', () => {
  // 6 x 9 classic is the tight case: a small grid that must still list seven
  // words. Taking the longest bite every time closed it in six about one sheet
  // in six, and that sheet printed "Could not fill the grid".
  for (const [w, h] of [
    [6, 9],
    [7.5, 9.25],
  ] as const) {
    it(`fills a classic ${w} x ${h} grid for every writer-sized pool`, { timeout: 60_000 }, () => {
      const failures: string[] = []
      for (let i = 0; i < 40; i++) {
        const rng = createRng(9000 + i)
        const words = rng.shuffle(WORDS).slice(0, 36 + rng.int(0, 4))
        const message = SAYINGS[i % SAYINGS.length]!
        const seed = 77 + i * 131
        resetObjectCounter()
        const [page] = def.generate(
          { ...buildDefaultConfig(def), level: 'classic', seed },
          { ...pageCtx(w, h), seed, instanceId: 'fill', remoteData: { message, words } },
        )
        if (page?.buildFailed) failures.push(`#${i}: ${page.buildFailed}`)
      }
      expect(failures).toEqual([])
    })
  }
})
