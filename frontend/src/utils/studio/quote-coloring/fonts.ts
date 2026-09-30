import type opentype from 'opentype.js'
import { fetchFontArrayBuffer, parseOpenTypeFont } from '@/utils/fetch-font-binary'

/**
 * The lettering faces a saying can be drawn in.
 *
 * The saying is drawn as vector outlines from the font file itself, never as
 * a text box: the export turns text into filled glyphs, which would print an
 * outline-only saying as solid black (or not at all), and a text box would
 * leave the page's look to whichever fallback face a reader's machine has.
 * Outlines taken from the file are the same shapes on screen, in the PDF and
 * on paper, and they can be measured before the page is accepted.
 *
 * Every face here is heavy enough that the inside of a letter is a space to
 * color, not a hairline, and plain enough to read at a glance: no script,
 * no high-contrast serifs, no distressed or decorative faces. `minEm` is the
 * smallest em (canvas px) at which every letter, counter and punctuation mark
 * of the face still clears the coloring floor — proven glyph by glyph in the
 * tests, not estimated.
 */

export type QcLetterStyleId = 'classic' | 'rounded' | 'playful' | 'serif' | 'retro' | 'bubbly' | 'slab'

export interface QcLetterStyle {
  id: QcLetterStyleId
  /** File under `/fonts`, bundled with the app. */
  file: string
  /** Set in capitals: bigger, simpler letters with open counters. */
  caps: boolean
  /** Smallest em size, canvas px, at which every glyph is colorable. */
  minEm: number
}

/**
 * Measured, not guessed: at `minEm` with the lettering pen, and at every
 * size above it, every letter's inside clears the lettering floor in
 * `compose.ts` — for the whole character set, at several sub-pixel
 * positions (the lettering tests re-prove it). Heavier faces were tried and
 * dropped: their counters close up before their strokes open wide enough to
 * color (a black-weight B is a blob with two pinholes), so they fit fewer
 * words at a colorable size. Galindo is set in capitals: its lowercase s
 * nearly closes on itself and leaves a pocket too small to color; so is
 * Baloo 2, whose lowercase e closes up.
 *
 * Every face is under the SIL Open Font License 1.1 (text beside the files
 * in `/fonts/licenses`), which allows printing its outlines in a book that is
 * sold; only the font file itself may not be sold. Baloo 2 Bold is the
 * 700-weight instance of the variable Baloo 2, which reserves no font name.
 * Faces tried and left out: Fredoka and Baloo 2 ExtraBold, whose A pinches
 * shut across most of the size range; Bungee, too wide at its colorable size
 * to letter a medallion on a letter page; Lilita One, Sniglet, Oswald and Chewy,
 * which close their counters until well past 110 px and fit too few words;
 * Bree Serif, which letters much like Patua One at a bigger size. Script,
 * outline, dotted and novelty faces are never candidates: joined letters
 * leave no paper between them, and a face already drawn as an outline would
 * print twice.
 */
export const QC_LETTER_STYLES: readonly QcLetterStyle[] = [
  { id: 'classic', file: 'Montserrat Bold.ttf', caps: true, minEm: 76 },
  { id: 'rounded', file: 'Rubik Bold.ttf', caps: true, minEm: 76 },
  { id: 'playful', file: 'Galindo.ttf', caps: true, minEm: 70 },
  { id: 'serif', file: 'Bitter Bold.ttf', caps: false, minEm: 88 },
  { id: 'retro', file: 'Righteous.ttf', caps: true, minEm: 84 },
  { id: 'bubbly', file: 'Baloo 2 Bold.ttf', caps: true, minEm: 94 },
  { id: 'slab', file: 'Patua One.ttf', caps: false, minEm: 96 },
]

export const qcLetterStyle = (id: string): QcLetterStyle | undefined => QC_LETTER_STYLES.find((style) => style.id === id)

/** Parsed faces by style. Generate reads them synchronously; prefetch loads them. */
export type QcFontSet = Partial<Record<QcLetterStyleId, opentype.Font>>

const cache = new Map<string, Promise<opentype.Font | null>>()

function loadFace(file: string): Promise<opentype.Font | null> {
  let pending = cache.get(file)
  if (!pending) {
    pending = fetchFontArrayBuffer(`/fonts/${file}`).then((buffer) => (buffer ? parseOpenTypeFont(buffer) : null))
    // A failed fetch must not poison the session: the next page tries again.
    pending.then((font) => {
      if (!font) cache.delete(file)
    })
    cache.set(file, pending)
  }
  return pending
}

/**
 * Every lettering face, loaded once per session. A face that cannot be
 * loaded is left out; the page letters in the ones that did, and says so
 * plainly if none did.
 */
export async function loadQcFonts(): Promise<QcFontSet> {
  const entries = await Promise.all(QC_LETTER_STYLES.map(async (style) => [style.id, await loadFace(style.file)] as const))
  const out: QcFontSet = {}
  for (const [id, font] of entries) if (font) out[id] = font
  return out
}
