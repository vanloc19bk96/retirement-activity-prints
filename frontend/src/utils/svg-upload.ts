import type { UploadedSvg } from '@/types/svg-upload.types'

const MAX_SVG_BYTES = 200 * 1024
const MAX_SVG_COUNT = 48
const SVG_MIME = 'image/svg+xml'

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `svg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function toSvgDataUri(svgText: string): string {
  const encoded =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(unescape(encodeURIComponent(svgText)))
      : Buffer.from(svgText, 'utf8').toString('base64')
  return `data:${SVG_MIME};charset=utf-8;base64,${encoded}`
}

function isSvgFile(file: File): boolean {
  if (file.type === SVG_MIME) return true
  return file.name.toLowerCase().endsWith('.svg')
}

function assertValidSvgMarkup(svgText: string, fileName: string): void {
  const trimmed = svgText.trim()
  if (!trimmed) {
    throw new Error(`“${fileName}” is empty`)
  }
  if (!/<svg[\s>]/i.test(trimmed)) {
    throw new Error(`“${fileName}” is not a valid SVG file`)
  }
  // Block scriptable payloads — canvas icons are print assets only.
  if (/<script[\s>]/i.test(trimmed) || /\bon\w+\s*=/i.test(trimmed)) {
    throw new Error(`“${fileName}” contains unsupported script content`)
  }
}

/** Read a local .svg file into an upload record for Components → SVG. */
export async function readSvgFile(file: File): Promise<UploadedSvg> {
  if (!isSvgFile(file)) {
    throw new Error(`“${file.name}” must be an SVG file`)
  }
  if (file.size > MAX_SVG_BYTES) {
    throw new Error(`“${file.name}” is too large (max ${MAX_SVG_BYTES / 1024}KB)`)
  }

  const svgText = await file.text()
  assertValidSvgMarkup(svgText, file.name)

  return {
    id: createId(),
    fileName: file.name,
    svgText,
    dataUri: toSvgDataUri(svgText),
  }
}

export function asUploadedSvgs(value: unknown): UploadedSvg[] {
  if (!Array.isArray(value)) return []
  const items: UploadedSvg[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Partial<UploadedSvg>
    if (
      typeof record.id !== 'string' ||
      typeof record.fileName !== 'string' ||
      typeof record.svgText !== 'string' ||
      typeof record.dataUri !== 'string'
    ) {
      continue
    }
    items.push({
      id: record.id,
      fileName: record.fileName,
      svgText: record.svgText,
      dataUri: record.dataUri,
    })
  }
  return items
}

export function mergeSvgUploads(
  existing: UploadedSvg[],
  incoming: UploadedSvg[],
): UploadedSvg[] {
  const merged = [...existing]
  for (const item of incoming) {
    if (merged.length >= MAX_SVG_COUNT) break
    merged.push(item)
  }
  return merged
}

export function svgUploadLimits() {
  return { maxCount: MAX_SVG_COUNT, maxBytes: MAX_SVG_BYTES }
}
