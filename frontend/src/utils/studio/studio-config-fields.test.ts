import { describe, expect, it } from 'vitest'
import type { StudioConfigField } from '@/types/studio-template.types'
import {
  clampStudioConfigToSchema,
  resolveStudioConfigField,
} from './studio-config-fields'

const SCHEMA: StudioConfigField[] = [
  {
    key: 'seqLength',
    label: 'Sequence length',
    type: 'number',
    default: 12,
    min: 8,
    max: 20,
  },
  {
    key: 'questionCount',
    label: 'Number of questions',
    type: 'number',
    default: 6,
    min: 3,
    max: 12,
    maxWhen: (c) => Math.min(12, Number(c.seqLength ?? 12) - 4),
    helpWhen: (c) => `Max ${Math.min(12, Number(c.seqLength ?? 12) - 4)}`,
  },
]

describe('resolveStudioConfigField', () => {
  it('applies dynamic max and help', () => {
    const resolved = resolveStudioConfigField(SCHEMA[1], { seqLength: 8 })
    expect(resolved.max).toBe(4)
    expect(resolved.help).toBe('Max 4')
  })

  it('applies dynamic warning', () => {
    const field: StudioConfigField = {
      key: 'types',
      label: 'Types',
      type: 'multiSelect',
      default: [],
      warningWhen: (c) => (Number(c.count) < 3 ? 'Too few' : null),
    }
    expect(resolveStudioConfigField(field, { count: 2 }).warning).toBe('Too few')
    expect(resolveStudioConfigField(field, { count: 5 }).warning).toBeUndefined()
  })
})

describe('clampStudioConfigToSchema', () => {
  it('clamps dependent number when max shrinks', () => {
    const next = clampStudioConfigToSchema(SCHEMA, {
      seqLength: 8,
      questionCount: 10,
    })
    expect(next.questionCount).toBe(4)
  })

  it('leaves values inside bounds unchanged', () => {
    const next = clampStudioConfigToSchema(SCHEMA, {
      seqLength: 14,
      questionCount: 6,
    })
    expect(next.questionCount).toBe(6)
  })

  it('snaps number fields to discrete valuesWhen', () => {
    const schema: StudioConfigField[] = [
      {
        key: 'listLength',
        label: 'List',
        type: 'number',
        default: 8,
        min: 5,
        max: 20,
      },
      {
        key: 'distractorCount',
        label: 'Extra',
        type: 'number',
        default: 10,
        valuesWhen: (c) => {
          const listLength = Number(c.listLength ?? 8)
          return listLength === 8 ? [4, 7, 10, 13, 16, 19] : [5, 7, 10]
        },
      },
    ]
    const next = clampStudioConfigToSchema(schema, {
      listLength: 8,
      distractorCount: 8,
    })
    // Prefer next valid at/above 8 → 10 (same direction as row-fill padding).
    expect(next.distractorCount).toBe(10)
  })
})
