import type { ComponentElementKey, PanelKey } from '@/components/layout/layout.types'

export const OPEN_COMPONENTS_ELEMENT_EVENT = 'editor:open-components-element'
export const OPEN_EDITOR_PANEL_EVENT = 'editor:open-panel'

export interface OpenComponentsElementDetail {
  element: ComponentElementKey
  /** When set, Components Back returns here instead of the Elements list. */
  returnPanel?: PanelKey
}

export interface OpenEditorPanelDetail {
  panel: PanelKey
}

/** Switch Sidebar to Components and open a nested element view (icon / emoji / …). */
export function dispatchOpenComponentsElement(
  element: ComponentElementKey,
  options?: { returnPanel?: PanelKey },
): void {
  window.dispatchEvent(
    new CustomEvent<OpenComponentsElementDetail>(OPEN_COMPONENTS_ELEMENT_EVENT, {
      detail: { element, returnPanel: options?.returnPanel },
    }),
  )
}

export function onOpenComponentsElement(
  handler: (detail: OpenComponentsElementDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<OpenComponentsElementDetail>).detail)
  }
  window.addEventListener(OPEN_COMPONENTS_ELEMENT_EVENT, listener)
  return () => window.removeEventListener(OPEN_COMPONENTS_ELEMENT_EVENT, listener)
}

/** Switch Sidebar to a top-level panel (Studio, Components, …). */
export function dispatchOpenEditorPanel(panel: PanelKey): void {
  window.dispatchEvent(
    new CustomEvent<OpenEditorPanelDetail>(OPEN_EDITOR_PANEL_EVENT, {
      detail: { panel },
    }),
  )
}

export function onOpenEditorPanel(
  handler: (detail: OpenEditorPanelDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<OpenEditorPanelDetail>).detail)
  }
  window.addEventListener(OPEN_EDITOR_PANEL_EVENT, listener)
  return () => window.removeEventListener(OPEN_EDITOR_PANEL_EVENT, listener)
}
