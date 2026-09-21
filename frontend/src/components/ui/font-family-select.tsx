import { getToolbarFontFamilies } from '@/constants/font-families'

type FontFamilySelectProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function FontFamilySelect({
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = 'Select font...',
}: FontFamilySelectProps): JSX.Element {
  const toolbarFonts = getToolbarFontFamilies()
  const baseClassName =
    'h-8 w-44 min-w-44 rounded-md border border-input bg-background px-2 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]'
  const optionClassName = 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100'
  const combinedClassName = className ? `${baseClassName} ${className}` : baseClassName

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={combinedClassName}
      disabled={disabled}
      aria-label="Font family"
    >
      {!value && placeholder && (
        <option value="" disabled className={optionClassName}>
          {placeholder}
        </option>
      )}
      {toolbarFonts.map((font) => (
        <option
          key={font.value}
          value={font.value}
          className={optionClassName}
          style={{ fontFamily: font.canvasFontFamily ?? font.value }}
        >
          {font.name}
        </option>
      ))}
    </select>
  )
}
