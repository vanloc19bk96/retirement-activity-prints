import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Study & Recall Grid symbol packs.
 * Rule: only glyphs built from basic shapes (circle, square/rect, triangle,
 * diamond, straight line, cross/plus) or clear composites of those.
 * Easy to memorize + hand-redraw; KDP/print-safe BMP; unique across packs.
 *
 * Dropped (not basic-shape constructions):
 * - Card suits, faces, music accidentals/notes, roman numerals
 * - Organic/weather icons (☀☁☂☾☽), detailed devices (☎☕⌚⛺⛳)
 * - Punctuation prose marks (!?#…‼), curved-loop arrows
 * - Fancy math (∑π∞√ fractions ⊂⊃∪∩∈…)
 * - Box-drawing junctions, block mosaics
 */
const packs = [
  {
    key: 'shapes',
    label: 'Shapes',
    items: [
      // primitives — filled / outline
      '■',
      '□',
      '●',
      '○',
      '▲',
      '△',
      '▼',
      '▽',
      '▶',
      '▷',
      '◀',
      '◁',
      '◆',
      '◇',
      '◊',
      '◻',
      '◼',
      '◯',
      '◎',
      '▭',
      '▰',
      '▱',
      '⬡',
      '⬢',
      // bars & single strokes
      '▬',
      '▮',
      '▯',
      '─',
      '│',
      '╱',
      '╲',
      '|',
      '‖',
      // right triangles & small pointers
      '◢',
      '◣',
      '◤',
      '◥',
      '▴',
      '▾',
      '▸',
      '◂',
      '▹',
      '◃',
      '▵',
      '▿',
      '▻',
      '◅',
      // half fills (circle / square halves)
      '◐',
      '◑',
      '◒',
      '◓',
      '◖',
      '◗',
      '◧',
      '◨',
      '◩',
      '◪',
    ],
  },
  {
    key: 'stars',
    label: 'Stars',
    items: ['★', '☆', '✧', '✦', '∗', '＊', '✚', '✛', '✙'],
  },
  {
    key: 'arrows',
    label: 'Arrows',
    items: [
      '←',
      '↑',
      '→',
      '↓',
      '↔',
      '↕',
      '↖',
      '↗',
      '↘',
      '↙',
      '⇐',
      '⇒',
      '⇑',
      '⇓',
      '⇦',
      '⇧',
      '⇨',
      '⇩',
      '⇈',
      '⇊',
      '⇉',
      '⇇',
    ],
  },
  {
    key: 'game',
    label: 'Game',
    // Square + dots only (1–2 pips stay easy to redraw).
    items: ['⚀', '⚁'],
  },
  {
    key: 'marks',
    label: 'Marks',
    items: [
      // dots & line marks
      '•',
      '◦',
      '·',
      '✓',
      '✕',
      '✗',
      // circle / square + stroke composites
      '⊕',
      '⊖',
      '⊙',
      '⊗',
      '⊘',
      '⊚',
      '⊞',
      '⊟',
      '⊠',
      '⊡',
      '☐',
      '⊤',
      '⊥',
      // brackets = straight / arc segments
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '⟨',
      '⟩',
      '⌈',
      '⌉',
      '⌊',
      '⌋',
    ],
  },
  {
    key: 'math',
    label: 'Math',
    items: [
      '+',
      '−',
      '±',
      '×',
      '÷',
      '=',
      '≠',
      '<',
      '>',
      '≤',
      '≥',
      '∠',
      '∟',
      '∆',
      '∘',
      '∙',
      '∕',
      '∖',
      '∥',
      '∧',
      '∨',
      '¬',
      '∅',
      '∴',
      '∵',
    ],
  },
  {
    key: 'nature',
    label: 'Nature',
    // Circle + line / arrow composites only.
    items: ['♀', '♂', '⚡'],
  },
  {
    key: 'objects',
    label: 'Objects',
    // Composites of triangle / square / rectangle / line.
    items: ['⌂', '⚐', '⚑', '⚠', '✉', '⌛'],
  },
]

const seen = new Map()
const warnings = []
const out = []

for (const pack of packs) {
  const uniq = []
  const local = new Set()
  for (const glyph of pack.items) {
    if (local.has(glyph)) {
      warnings.push(`within ${pack.key}: duplicate ${glyph}`)
      continue
    }
    local.add(glyph)
    if (seen.has(glyph)) {
      warnings.push(`cross: drop ${glyph} from ${pack.key} (also in ${seen.get(glyph)})`)
      continue
    }
    seen.set(glyph, pack.key)
    uniq.push(glyph)
  }
  out.push({ key: pack.key, label: pack.label, count: uniq.length, items: uniq })
}

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '../src/data/studio/symbols/index.json')
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`, 'utf8')

for (const w of warnings) console.warn(w)
for (const p of out) console.log(`${p.key}\t${p.count}`)
console.log(`mixed\t${seen.size}`)
console.log(`wrote\t${target}`)
