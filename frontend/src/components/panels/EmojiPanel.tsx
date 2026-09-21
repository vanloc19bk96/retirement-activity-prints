import type React from 'react'
import { memo, useEffect, useRef } from 'react'

import { useEmojiLibrary } from '@/hooks/use-emoji-library'
import { setEmojiDragData } from '@/utils/emoji-dnd'
import type { EmojiAsset } from '@/types/emojis.types'

const LOAD_MORE_ROOT_MARGIN_PX = 160

const EmojiTile = memo(function EmojiTile({ asset }: { asset: EmojiAsset }): JSX.Element {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>): void => {
    setEmojiDragData(event.dataTransfer, {
      publicUrl: asset.imagePublicUrl,
      label: asset.title,
    })
  }

  return (
    <div
      draggable
      role="button"
      onDragStart={handleDragStart}
      className="group flex aspect-square w-full cursor-grab items-center justify-center rounded-md border border-border bg-card p-1 transition-colors hover:border-primary/50 hover:bg-accent/40 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Drag emoji ${asset.title}`}
    >
      <img
        src={asset.imagePublicUrl}
        alt=""
        className="size-12 object-contain"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </div>
  )
})

export function EmojiPanel(): JSX.Element {
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore } = useEmojiLibrary()
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scrollRoot = scrollRef.current
    const trigger = loadMoreTriggerRef.current
    if (!scrollRoot || !trigger) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!hasMore || isLoadingMore || isLoading) return
        void loadMore()
      },
      { root: scrollRoot, rootMargin: `${LOAD_MORE_ROOT_MARGIN_PX}px` },
    )

    observer.observe(trigger)
    return () => observer.disconnect()
  }, [hasMore, isLoading, isLoadingMore, loadMore, items.length])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-[11px] text-muted-foreground">Drag an emoji onto the canvas.</p>

      {error ? (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-md [scrollbar-gutter:stable]"
      >
        {isLoading && items.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">No emojis available.</p>
        ) : (
          <>
            <ul className="grid grid-cols-4 gap-1.5" role="list">
              {items.map((asset) => (
                <li
                  key={asset.id}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '58px' }}
                >
                  <EmojiTile asset={asset} />
                </li>
              ))}
            </ul>
            {hasMore ? (
              <div className="space-y-2 py-2">
                <div ref={loadMoreTriggerRef} className="h-2 w-full" aria-hidden />
                {isLoadingMore ? (
                  <p className="text-center text-[11px] text-muted-foreground">Loading more…</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
