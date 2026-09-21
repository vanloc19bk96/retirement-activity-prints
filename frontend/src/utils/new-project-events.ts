export const CREATE_NEW_PROJECT_EVENT = 'editor:create-new-project'

export function dispatchCreateNewProject(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CREATE_NEW_PROJECT_EVENT))
}

export function onCreateNewProject(handler: () => void): () => void {
  const listener = (): void => {
    handler()
  }
  window.addEventListener(CREATE_NEW_PROJECT_EVENT, listener)
  return () => window.removeEventListener(CREATE_NEW_PROJECT_EVENT, listener)
}
