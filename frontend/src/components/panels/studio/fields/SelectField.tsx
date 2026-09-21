import { PopoverSelect } from '@/components/ui/popover-select'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function SelectField({
  field,
  value,
  onChange,
  error,
}: StudioFieldProps<string | number>) {
  const options = field.options ?? []
  const toValue = (raw: string) => options.find((o) => String(o.value) === raw)?.value ?? raw
  const stringValue = String(value)
  const isKnown = options.some((o) => String(o.value) === stringValue)
  const effective = isKnown ? stringValue : String(options[0]?.value ?? stringValue)

  return (
    <FieldShell label={field.label} help={field.help} error={error}>
      <PopoverSelect
        value={effective}
        onChange={(raw) => onChange(toValue(raw))}
        ariaLabel={field.label}
        options={options.map((o) => ({
          value: String(o.value),
          label: o.label,
        }))}
      />
    </FieldShell>
  )
}
