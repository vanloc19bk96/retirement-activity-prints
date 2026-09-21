import { describe, expect, it } from 'vitest'
import { createRng } from '../studio-rng'
import { randomFaceMixEntry, type FaceMixEntry } from './face-specs'
import { FACE_VIEW_BOX, renderFaceMixSvg, svgToImgSrc } from './face-preview'
import { resolveMixedPeople } from './prefetch'
import type { NameEntry } from './names'

const { x, y, size } = FACE_VIEW_BOX

function mix(overrides: Partial<FaceMixEntry> = {}): FaceMixEntry {
  return { ...randomFaceMixEntry('female', createRng(7)), ...overrides }
}

describe('face-name-recall preview', () => {
  it('reframes Open Peeps to the head-and-shoulders crop', () => {
    const svg = renderFaceMixSvg(mix())
    expect(svg).toContain(`viewBox="${x} ${y} ${size} ${size}"`)
    expect(svg).not.toContain('viewBox="0 0 704 704"')
    // Arms and hands live below the crop; the frame must state its own size so
    // <img> and Fabric never fall back to the full figure.
    expect(svg).toContain(`width="${size}"`)
    expect(svg).toContain(`height="${size}"`)
  })

  it('paints line art only in black and white', () => {
    const colors = new Set(renderFaceMixSvg(mix()).match(/#[0-9a-f]{3,6}/gi))
    expect(colors).toEqual(new Set(['#fff', '#ffffff', '#000000']))
  })

  it('encodes an <img>-ready data URI', () => {
    expect(svgToImgSrc('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
  })
})

describe('resolveMixedPeople', () => {
  const generated: NameEntry[] = [
    { first: 'Ana', gender: 'female', display: 'Ana' },
    { first: 'Ben', gender: 'male', display: 'Ben' },
  ]

  it('uses typed names and fills the blanks by gender', () => {
    const people = resolveMixedPeople(
      [
        mix({ id: 'a', gender: 'female', name: 'Grandma Rose' }),
        mix({ id: 'b', gender: 'male', name: '' }),
        mix({ id: 'c', gender: 'female', name: '' }),
      ],
      generated,
    )
    expect(people.map((entry) => entry.display)).toEqual(['Grandma Rose', 'Ben', 'Ana'])
  })

  it('needs no generated names when every face is named', () => {
    const people = resolveMixedPeople(
      [mix({ id: 'a', name: 'Mai' }), mix({ id: 'b', name: 'Linh' })],
      [],
    )
    expect(people.map((entry) => entry.display)).toEqual(['Mai', 'Linh'])
  })
})
