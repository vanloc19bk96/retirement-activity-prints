export const EDITOR_INSERT_PAGES_EVENT = 'editor:insert-pages'
export const EDITOR_REMOVE_PAGES_EVENT = 'editor:remove-pages'

export interface EditorInsertPagesDetail {
  /** Insert new pages after this index (first new page = afterPageIndex + 1). */
  afterPageIndex: number
  count: number
}

export interface EditorRemovePagesDetail {
  /** First page index to remove (inclusive). */
  startPageIndex: number
  count: number
}

export function dispatchEditorInsertPages(detail: EditorInsertPagesDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EDITOR_INSERT_PAGES_EVENT, { detail }))
}

export function dispatchEditorRemovePages(detail: EditorRemovePagesDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EDITOR_REMOVE_PAGES_EVENT, { detail }))
}

/**
 * Insert `count` pages so the first new page lands at `startPageIndex`.
 * MainContent inserts after `afterPageIndex`, so we pass startPageIndex - 1.
 */
export function addPagesAt(startPageIndex: number, count: number): void {
  if (count <= 0) return
  dispatchEditorInsertPages({
    afterPageIndex: Math.max(-1, startPageIndex - 1),
    count,
  })
}

/**
 * Remove `count` consecutive pages starting at `startPageIndex`.
 * Used to trim unused bulk-preallocated blanks after cancel or short sheets.
 */
export function removePagesAt(startPageIndex: number, count: number): void {
  if (count <= 0) return
  dispatchEditorRemovePages({ startPageIndex, count })
}

export function onEditorInsertPages(
  handler: (detail: EditorInsertPagesDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<EditorInsertPagesDetail>).detail)
  window.addEventListener(EDITOR_INSERT_PAGES_EVENT, listener)
  return () => window.removeEventListener(EDITOR_INSERT_PAGES_EVENT, listener)
}

export function onEditorRemovePages(
  handler: (detail: EditorRemovePagesDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<EditorRemovePagesDetail>).detail)
  window.addEventListener(EDITOR_REMOVE_PAGES_EVENT, listener)
  return () => window.removeEventListener(EDITOR_REMOVE_PAGES_EVENT, listener)
}
