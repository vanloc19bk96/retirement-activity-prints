import type { StudioConfigField as FieldDef } from '@/types/studio-template.types'
import { NumberField } from './fields/NumberField'
import { SelectField } from './fields/SelectField'
import { MultiSelectField } from './fields/MultiSelectField'
import { ToggleField } from './fields/ToggleField'
import { TextField } from './fields/TextField'
import { ColorField } from './fields/ColorField'
import { WordListField } from './fields/WordListField'
import { NumberListField } from './fields/NumberListField'
import { SeedField } from './fields/SeedField'
import { FaceMixField } from './fields/FaceMixField'

export interface StudioFieldProps<T = unknown> {
  field: FieldDef
  value: T
  onChange: (value: T) => void
  error?: string | null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v))
}

export function StudioConfigField({ field, value, onChange, error }: StudioFieldProps) {
  switch (field.type) {
    case 'number':
      return (
        <NumberField field={field} value={Number(value)} onChange={onChange} error={error} />
      )
    case 'select':
      return (
        <SelectField
          field={field}
          value={value as string | number}
          onChange={onChange}
          error={error}
        />
      )
    case 'multiSelect':
      return (
        <MultiSelectField
          field={field}
          value={asStringArray(value)}
          onChange={onChange}
          error={error}
        />
      )
    case 'toggle':
      return (
        <ToggleField field={field} value={Boolean(value)} onChange={onChange} error={error} />
      )
    case 'text':
      return (
        <TextField
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
          error={error}
        />
      )
    case 'color':
      return (
        <ColorField
          field={field}
          value={String(value ?? '#000000')}
          onChange={onChange}
          error={error}
        />
      )
    case 'wordList':
      return (
        <WordListField
          field={field}
          value={value as string[] | string}
          onChange={onChange}
          error={error}
        />
      )
    case 'numberList':
      return (
        <NumberListField
          field={field}
          value={value as number[] | string[] | string}
          onChange={onChange}
          error={error}
        />
      )
    case 'seed':
      return (
        <SeedField
          field={field}
          value={Number(value ?? 1)}
          onChange={onChange}
          error={error}
        />
      )
    case 'faceMix':
      return (
        <FaceMixField field={field} value={value} onChange={onChange} error={error} />
      )
    default: {
      const exhaustive: never = field.type
      return exhaustive
    }
  }
}
