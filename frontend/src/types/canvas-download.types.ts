export type DownloadFormat = 'png' | 'jpg' | 'pdf' | 'svg' | 'ppt'

export type DownloadProgressStatus =
  | 'idle'
  | 'preparing'
  | 'exporting'
  | 'packaging'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Coarse milestone emitted by each format exporter.
 */
export type CanvasExportProgress = {
  label: string
  completed: number
  total: number
}

export type CanvasExportProgressReporter = (progress: CanvasExportProgress) => void | Promise<void>

export const PRO_ONLY_DOWNLOAD_FORMATS = new Set<DownloadFormat>(['svg', 'ppt'])

export const CANCEL_DOWNLOAD_ERROR_MESSAGE = 'DOWNLOAD_CANCELLED_BY_USER'
export const EMPTY_IMAGE_EXPORT_ERROR_MESSAGE = 'NO_NON_EMPTY_CANVAS_FOR_IMAGE_EXPORT'

/** Selected page count at or above which tab switches can interrupt a long export. */
export const LARGE_DOWNLOAD_PAGE_THRESHOLD = 100
