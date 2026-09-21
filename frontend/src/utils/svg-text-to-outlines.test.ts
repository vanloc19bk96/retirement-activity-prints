import { describe, it, expect } from 'vitest'
import opentype from 'opentype.js'
import { sanitizeTextForOutlineFont } from './svg-text-to-outlines'

/** Minimal font stub: only ASCII letters/digits/punctuation have real glyphs. */
function stubFont(presentChars: string): opentype.Font {
  const present = new Set([...presentChars])
  return {
    charToGlyph(char: string) {
      if (present.has(char)) {
        return { index: 1, name: 'glyph' }
      }
      return { index: 0, name: '.notdef' }
    },
  } as unknown as opentype.Font
}

describe('sanitizeTextForOutlineFont', () => {
  it('keeps characters the font can outline', () => {
    const font = stubFont('Order: 12AB->.')
    expect(sanitizeTextForOutlineFont('Order: 1', font)).toBe('Order: 1')
  })

  it('replaces missing arrows and ellipsis with ASCII stand-ins', () => {
    const font = stubFont('Order: 12AB .')
    expect(sanitizeTextForOutlineFont('Order: 1 → A …', font)).toBe(
      'Order: 1 -> A ...',
    )
  })

  it('does not replace arrows when the font already has them', () => {
    const font = stubFont('1→A')
    expect(sanitizeTextForOutlineFont('1→A', font)).toBe('1→A')
  })

  it('replaces missing logical ∧/∨ with ASCII stand-ins', () => {
    const font = stubFont('123')
    expect(sanitizeTextForOutlineFont('1∧2∨3', font)).toBe('1^2v3')
  })
})
