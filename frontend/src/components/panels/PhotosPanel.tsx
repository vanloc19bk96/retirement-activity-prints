import { useEffect, useRef, useState } from 'react'
import { ImageIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useOutlineLibrary } from '@/hooks/use-outline-library'
import type { PhotosPanelProps } from '@/types/photos-panel.types'
import { setImageDragData } from '@/utils/image-dnd'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export function PhotosPanel({ isOpen }: PhotosPanelProps): JSX.Element {
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)

  const { items, isLoading, isLoadingMore, error, hasMore, loadMore } = useOutlineLibrary({
    query: debouncedSearch,
    isEnabled: isOpen,
  })
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const target = loadMoreTriggerRef.current
    if (!target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!hasMore || isLoadingMore || isLoading) return
        void loadMore()
      },
      { rootMargin: '120px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isLoading, isLoadingMore, isOpen, loadMore])

  return (
    <section className="flex w-full flex-col gap-4" aria-label="Photos">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <ImageIcon className="h-4 w-4 text-foreground" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Photos</h2>
            <p className="text-xs text-muted-foreground">Reusable outline assets</p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="photos-search">
          Search photos
        </label>
        <input
          id="photos-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search outlines"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos match your search.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2" role="list">
          {items.map((asset) => {
            const previewUrl = asset.thumbnailPublicUrl ?? asset.imagePublicUrl
            const pathPart = asset.imagePublicUrl.split('/').pop()?.split('?')[0] ?? ''
            const extFromUrl = pathPart.includes('.') ? pathPart.split('.').pop() : null
            const fileName = `${asset.slug}.${extFromUrl ?? 'png'}`
            return (
              <li key={asset.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '140px' }}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    setImageDragData(e.dataTransfer, {
                      publicUrl: asset.imagePublicUrl,
                      fileName,
                    })
                  }}
                  className="group flex w-full cursor-grab flex-col items-center overflow-hidden rounded-md border border-border bg-muted/20 text-center transition-colors hover:bg-accent/60 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Drag photo ${asset.title}`}
                >
                  <span className="relative aspect-square w-full overflow-hidden bg-muted/40">
                    <img
                      src={previewUrl}
                      alt={asset.title}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      draggable={false}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="space-y-2">
          <div ref={loadMoreTriggerRef} className="h-2 w-full" aria-hidden />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
