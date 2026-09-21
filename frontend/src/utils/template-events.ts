import { beginDndDragCursor } from '@/utils/dnd-cursor'

export const APPLY_TEMPLATE_TO_CANVAS_EVENT = 'canvas:apply-template'
export const TEMPLATE_DND_MIME = 'application/x-book-editor-template'

export interface ApplyTemplateToCanvasEventDetail {
  templateJsonUrl: string
}

export interface DroppedTemplatePayload {
  templateJsonUrl: string
}

export function setTemplateDragData(
  dataTransfer: DataTransfer,
  payload: DroppedTemplatePayload,
): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(TEMPLATE_DND_MIME, JSON.stringify(payload))
  // Keep plain text empty so text drop handlers do not render template JSON URL as text.
  dataTransfer.setData('text/plain', '')
}

export function getDroppedTemplatePayload(dataTransfer: DataTransfer): DroppedTemplatePayload | null {
  const raw = dataTransfer.getData(TEMPLATE_DND_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DroppedTemplatePayload>
    if (typeof parsed?.templateJsonUrl !== 'string' || parsed.templateJsonUrl.trim().length === 0) {
      return null
    }
    return { templateJsonUrl: parsed.templateJsonUrl.trim() }
  } catch {
    return null
  }
}
