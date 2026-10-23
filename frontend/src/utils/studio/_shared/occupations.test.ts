import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  OCCUPATION_BRAND_TERMS,
  OCCUPATION_NAME_MAX,
  OCCUPATION_NAME_MAX_WORDS,
  OCCUPATION_REFUSED_TERMS,
  PRESET_OCCUPATIONS,
  cleanOccupation,
  foldOccupation,
  occupationNameProblem,
  occupationTitle,
  presetForName,
  typedOccupation,
  typedPreset,
  validateTypedOccupation,
} from './occupations'

/**
 * The form checks a typed job before it is sent, with the service's own
 * rules, so a seller sees the same message either way. This reads the data
 * file the service loads, so a list edited on one side only fails here.
 */
const DATA = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/occupations/prompt.json', import.meta.url),
)
const data = JSON.parse(readFileSync(DATA, 'utf-8')) as {
  limits: Record<string, number>
  presets: Record<string, { label: string }>
  refusedTerms: string[]
  brandTerms: string[]
}

describe('occupations mirror the service', () => {
  it('offers the service’s presets, in its order, with its labels', () => {
    expect(PRESET_OCCUPATIONS.map((o) => o.value)).toEqual(Object.keys(data.presets))
    for (const o of PRESET_OCCUPATIONS) expect(o.label).toBe(data.presets[o.value]!.label)
  })

  it('refuses the same names', () => {
    expect([...OCCUPATION_REFUSED_TERMS]).toEqual(data.refusedTerms)
    expect([...OCCUPATION_BRAND_TERMS]).toEqual(data.brandTerms)
  })

  it('uses the same name limits', () => {
    expect(OCCUPATION_NAME_MAX).toBe(data.limits.maxNameChars)
    expect(OCCUPATION_NAME_MAX_WORDS).toBe(data.limits.maxNameWords)
  })
})

describe('a typed occupation', () => {
  it.each(['Firefighter', 'bus driver', 'HVAC technician', '911 dispatcher', "Teacher's aide", 'Firefighter/EMT'])(
    'accepts %s',
    (name) => {
      expect(occupationNameProblem(name)).toBeNull()
    },
  )

  it.each([
    ['', 'Type an occupation'],
    ['x'.repeat(41), 'under 40'],
    ['one two three four five six', '5 words'],
    ['12', 'letters'],
    ['Fire<fighter>', 'letters'],
    ['Walmart greeter', 'company or brand'],
    ['Stripper', 'can’t be used'],
  ])('refuses %j', (name, fragment) => {
    expect(occupationNameProblem(name)).toContain(fragment)
  })

  it('reads and folds the way the service does', () => {
    expect(cleanOccupation('  Bus   Driver ')).toBe('Bus Driver')
    expect(foldOccupation('Teacher’s  Aide')).toBe("teacher's aide")
    expect(occupationTitle('bus driver')).toBe('Bus Driver')
    expect(occupationTitle('HVAC technician')).toBe('HVAC Technician')
    expect(occupationTitle('firefighter/emt')).toBe('Firefighter/Emt')
  })

  it('is the preset when it names one', () => {
    expect(presetForName(' TEACHER ')).toBe('teacher')
    expect(presetForName('Firefighter')).toBeNull()
    const typed = { writeOwnOccupation: true, customOccupation: 'Police' }
    expect(typedOccupation(typed)).toBe('')
    expect(typedPreset(typed)).toBe('police')
  })

  it('counts only while the switch is on', () => {
    expect(typedOccupation({ customOccupation: 'Firefighter' })).toBe('')
    expect(validateTypedOccupation({ customOccupation: '' })).toBeNull()
    expect(typedOccupation({ writeOwnOccupation: true, customOccupation: ' Firefighter ' })).toBe('Firefighter')
    expect(validateTypedOccupation({ writeOwnOccupation: true, customOccupation: '' })).toEqual({
      field: 'customOccupation',
      message: 'Type an occupation.',
    })
  })
})
