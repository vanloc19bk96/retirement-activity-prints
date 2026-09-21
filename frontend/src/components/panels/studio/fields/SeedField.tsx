import { Shuffle } from 'lucide-react'
import { randomStudioSeed } from '@/constants/studio.constants'
import { FieldShell } from './FieldShell'
import { STUDIO_FIELD_INPUT_CLASS } from './field-input-classes'
import type { StudioFieldProps } from '../StudioConfigField'

export function SeedField({ field, value, onChange, error }: StudioFieldProps<number>) {
  const randomize = () => onChange(randomStudioSeed())

  return (
    <FieldShell
      htmlFor={field.key}
      label={field.label}
      help={field.help}
      error={error}
      action={
        <button
          type="button"
          onClick={randomize}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Shuffle className="h-3 w-3" aria-hidden />
          Randomize
        </button>
      }
    >
      <input
        id={field.key}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
        className={`${STUDIO_FIELD_INPUT_CLASS} font-mono`}
      />
    </FieldShell>
  )
}
