export const SCROLL_TO_EDITOR_PAGE_EVENT = 'editor:scroll-to-page'

export type ScrollToEditorPageEventDetail = {
  pageIndex: number
}

export function dispatchScrollToEditorPage(pageIndex: number): void {
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return

  window.dispatchEvent(
    new CustomEvent<ScrollToEditorPageEventDetail>(SCROLL_TO_EDITOR_PAGE_EVENT, {
      detail: { pageIndex: Math.trunc(pageIndex) },
    }),
  )
}
