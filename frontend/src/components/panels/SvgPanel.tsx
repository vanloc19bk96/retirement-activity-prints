import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { UploadedSvg } from '@/types/svg-upload.types'
import { setImageDragData } from '@/utils/image-dnd'
import {
  mergeSvgUploads,
  readSvgFile,
  svgUploadLimits,
} from '@/utils/svg-upload'

const { maxCount } = svgUploadLimits()

export function SvgPanel(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<UploadedSvg[]>([])
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = 'components-svg-upload'

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setError(null)
    setIsReading(true)
    try {
      const remaining = maxCount - items.length
      if (remaining <= 0) {
        setError(`You can upload at most ${maxCount} SVGs`)
        return
      }

      const files = Array.from(fileList).slice(0, remaining)
      const uploaded: UploadedSvg[] = []
      const failures: string[] = []

      for (const file of files) {
        try {
          uploaded.push(await readSvgFile(file))
        } catch (caught) {
          failures.push(caught instanceof Error ? caught.message : `Failed to read ${file.name}`)
        }
      }

      if (uploaded.length > 0) {
        setItems((current) => mergeSvgUploads(current, uploaded))
      }
      if (failures.length > 0) {
        setError(failures[0] ?? 'Some files could not be read')
      }
    } finally {
      setIsReading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  const handleClear = () => {
    setItems([])
    setError(null)
  }

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    item: UploadedSvg,
  ): void => {
    setImageDragData(event.dataTransfer, {
      publicUrl: item.dataUri,
      fileName: item.fileName,
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Upload SVGs, then drag them onto the canvas.
        </p>
        {items.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            onClick={handleClear}
            aria-label="Clear all uploaded SVGs"
          >
            Clear
          </Button>
        ) : null}
      </div>

      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input bg-muted/40 px-3 py-6 text-center transition hover:border-muted-foreground/40 hover:bg-accent"
      >
        <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium text-foreground">
          {isReading ? 'Reading SVGs…' : 'Click to upload SVGs'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          .svg only · up to {maxCount} files
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          className="hidden"
          disabled={isReading || items.length >= maxCount}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Uploaded SVGs">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative overflow-hidden rounded-md border border-border bg-background"
            >
              <div
                draggable
                onDragStart={(event) => handleDragStart(event, item)}
                className="flex h-16 cursor-grab items-center justify-center bg-muted/30 p-1.5 active:cursor-grabbing"
                aria-label={`Drag ${item.fileName} onto canvas`}
              >
                <img
                  src={item.dataUri}
                  alt={item.fileName}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              </div>
              <p
                className="truncate px-1.5 py-1 text-[10px] text-muted-foreground"
                title={item.fileName}
              >
                {item.fileName}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 h-6 w-6 bg-background/90"
                onClick={() => handleRemove(item.id)}
                aria-label={`Remove ${item.fileName}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
