const DND_DRAGGING_CLASS = 'is-dnd-dragging'

export function beginDndDragCursor(): void {
  document.body.classList.add(DND_DRAGGING_CLASS)
}

export function endDndDragCursor(): void {
  document.body.classList.remove(DND_DRAGGING_CLASS)
}

if (typeof document !== 'undefined') {
  document.addEventListener('dragend', endDndDragCursor)
  document.addEventListener('drop', endDndDragCursor)
}
