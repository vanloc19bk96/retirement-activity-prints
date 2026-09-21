import { describe, expect, it } from 'vitest'
import { createRng } from '../studio-rng'
import {
  normalizeGender,
  orderNamesForGenders,
  pickNames,
  toNameEntries,
  type NameEntry,
} from './names'

describe('face-name-recall names', () => {
  it('toNameEntries maps gender and display for first-only style', () => {
    const entries = toNameEntries(
      [
        { first: 'Elena', gender: 'female' },
        { first: 'Marcus', last: 'Cole', gender: 'male' },
        { first: 'Alex', gender: 'neutral' },
      ],
      'first',
    )
    expect(entries).toEqual([
      { first: 'Elena', last: undefined, gender: 'female', display: 'Elena' },
      { first: 'Marcus', last: undefined, gender: 'male', display: 'Marcus' },
      { first: 'Alex', last: undefined, gender: 'neutral', display: 'Alex' },
    ])
  })

  it('toNameEntries keeps last name when style is full', () => {
    const entries = toNameEntries(
      [{ first: 'Marcus', last: 'Cole', gender: 'male' }],
      'full',
    )
    expect(entries[0]).toEqual({
      first: 'Marcus',
      last: 'Cole',
      gender: 'male',
      display: 'Marcus Cole',
    })
  })

  it('normalizeGender is case-insensitive and falls back to neutral', () => {
    expect(normalizeGender('male')).toBe('male')
    expect(normalizeGender('Female')).toBe('female')
    expect(normalizeGender('NEUTRAL')).toBe('neutral')
    expect(normalizeGender(undefined)).toBe('neutral')
    expect(normalizeGender('other')).toBe('neutral')
  })

  it('pickNames fallback returns the requested count', () => {
    const names = pickNames({ nameStyle: 'first', seed: 7 }, 6, createRng(7))
    expect(names).toHaveLength(6)
    expect(new Set(names.map((n) => n.first)).size).toBe(6)
  })
})

describe('orderNamesForGenders', () => {
  const entries: NameEntry[] = [
    { first: 'Ana', gender: 'female', display: 'Ana' },
    { first: 'Ben', gender: 'male', display: 'Ben' },
    { first: 'Cam', gender: 'neutral', display: 'Cam' },
    { first: 'Dee', gender: 'female', display: 'Dee' },
  ]

  it('moves each name onto a face of the same gender', () => {
    const ordered = orderNamesForGenders(entries, ['male', 'female', 'female', 'female'])
    expect(ordered.map((entry) => entry.display)).toEqual(['Ben', 'Ana', 'Dee', 'Cam'])
  })

  it('never reuses a name and always fills every slot', () => {
    const ordered = orderNamesForGenders(entries, ['male', 'male', 'male', 'male'])
    expect(ordered).toHaveLength(4)
    expect(new Set(ordered.map((entry) => entry.display)).size).toBe(4)
  })

  it('falls back to a placeholder when names run short', () => {
    const ordered = orderNamesForGenders(entries.slice(0, 1), ['female', 'male'])
    expect(ordered[0].display).toBe('Ana')
    expect(ordered[1].display).toBe('Person 2')
  })
})
