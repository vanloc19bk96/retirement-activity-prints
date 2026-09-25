import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import type { QuoteColoringItem } from '@/types/studio-quote-coloring.types'
import { QC_LETTER_STYLES, type QcFontSet } from './fonts'
import type { QcRemoteData } from './prefetch'

/**
 * Test-only: sayings shaped like a reply from the content service, and the
 * lettering faces read from the bundled font files.
 *
 * Every saying already passes the gates in `content.ts` and carries the
 * service's `verified` mark, and they differ in length, form and idea. A
 * fixture that needed thinning before use would test the gates instead of the
 * page.
 */
export const QC_FIXTURE_ITEMS: readonly QuoteColoringItem[] = [
  { text: 'My calendar only lists sunsets now', verified: true },
  { text: 'The porch is my new corner office', verified: true },
  { text: 'Every Tuesday feels like a picnic', verified: true },
  { text: 'Plant something new each spring', verified: true },
  { text: 'Less rushing, more wandering down side streets', verified: true },
  { text: 'Today I report to the garden', verified: true },
  { text: 'Pack light, wander far', verified: true },
  { text: 'Who needs Mondays? I have mornings!', verified: true },
]

let fonts: QcFontSet | null = null

/** The bundled faces, parsed once per test run. */
export function qcTestFonts(): QcFontSet {
  if (fonts) return fonts
  const out: QcFontSet = {}
  for (const style of QC_LETTER_STYLES) {
    const path = fileURLToPath(new URL(`../../../../public/fonts/${style.file}`, import.meta.url))
    const buffer = readFileSync(path)
    out[style.id] = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  }
  fonts = out
  return out
}

export function qcFixture(items: readonly QuoteColoringItem[] = QC_FIXTURE_ITEMS, bookLabels: string[] = []): QcRemoteData {
  return { items: [...items], bookLabels, fonts: qcTestFonts() }
}
