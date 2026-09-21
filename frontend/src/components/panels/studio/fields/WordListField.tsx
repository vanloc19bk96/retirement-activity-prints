import { useRef, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

const DEFAULT_PLACEHOLDER = 'CAT\nDOG\nBIRD'

function toLines(value: unknown): string {
  if (Array.isArray(value)) return value.map((w) => String(w)).join('\n')
  return String(value ?? '')
}

function linesFromText(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/** Custom vocabulary entry — one word (or word | clue) per line, stored as string[]. */
export function WordListField({
  field,
  value,
  onChange,
  error,
}: StudioFieldProps<string[] | string>) {
  const text = toLines(value)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const placeholder = field.placeholder?.trim() || DEFAULT_PLACEHOLDER

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Allow re-importing the same file later.
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : ''
      onChange(linesFromText(raw))
    }
    reader.onerror = () => {
      console.warn('[word-list] Failed to read import file', reader.error)
    }
    reader.readAsText(file)
  }

  return (
    <FieldShell
      htmlFor={field.key}
      label={field.label}
      help={field.help}
      warning={field.warning}
      error={error}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={handleImportClick}
          aria-label={`Import ${field.label} from a text file`}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Import .txt
        </Button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleFileChange}
      />
      <textarea
        id={field.key}
        value={text}
        onChange={(e) => onChange(linesFromText(e.target.value))}
        rows={8}
        spellCheck={false}
        aria-label={field.label}
        placeholder={placeholder}
        className="flex min-h-[8rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      />
    </FieldShell>
  )
}
