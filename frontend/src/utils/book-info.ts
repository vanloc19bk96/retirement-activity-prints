import {
  BOOK_INTERIOR_TYPES_BY_BINDING,
  BOOK_PAPER_TYPES_BY_INTERIOR_TYPE,
  DEFAULT_BOOK_BINDING_TYPE,
  DEFAULT_BOOK_READING_DIRECTION,
  KDP_MAX_PAGE_COUNT,
  KDP_MIN_PAGE_COUNT,
  type BookBindingType,
  type BookReadingDirection,
} from '@/constants/book-information.constants'
import {
  AMAZON_KDP_PAGE_SIZES,
  DEFAULT_PAGE_SIZE_LABEL,
  type PageSizeLabel,
} from '@/types/canvas-settings.types'
import type { ProjectBookInfo } from '@/types/projects.types'

export function clampBookCoverPageCount(value: number): number {
  if (!Number.isFinite(value)) return KDP_MIN_PAGE_COUNT
  return Math.min(KDP_MAX_PAGE_COUNT, Math.max(KDP_MIN_PAGE_COUNT, Math.round(value)))
}

function resolveTrimBookSize(rawValue: string | undefined, fallback: PageSizeLabel): PageSizeLabel {
  if (rawValue && (AMAZON_KDP_PAGE_SIZES as readonly string[]).includes(rawValue)) {
    return rawValue as PageSizeLabel
  }
  return fallback
}

export function createDefaultProjectBookInfo(
  trimBookSize: PageSizeLabel,
  pageCount = KDP_MIN_PAGE_COUNT,
): ProjectBookInfo {
  const interiorType = BOOK_INTERIOR_TYPES_BY_BINDING[DEFAULT_BOOK_BINDING_TYPE][0]
  return {
    bindingType: DEFAULT_BOOK_BINDING_TYPE,
    interiorType,
    paperType: BOOK_PAPER_TYPES_BY_INTERIOR_TYPE[interiorType][0],
    readingDirection: DEFAULT_BOOK_READING_DIRECTION,
    trimBookSize,
    pageCount: clampBookCoverPageCount(pageCount),
  }
}

export const DEFAULT_PROJECT_BOOK_INFO: ProjectBookInfo = createDefaultProjectBookInfo(
  DEFAULT_PAGE_SIZE_LABEL,
  KDP_MIN_PAGE_COUNT,
)

export function resolveBindingType(rawValue: string | undefined): BookBindingType {
  if (rawValue === 'hardcover' || rawValue === 'paperback') return rawValue
  return DEFAULT_BOOK_BINDING_TYPE
}

export function resolveInteriorType(
  bindingType: BookBindingType,
  rawValue: string | undefined,
): string {
  const options = BOOK_INTERIOR_TYPES_BY_BINDING[bindingType]
  if (rawValue && options.includes(rawValue)) return rawValue
  return options[0]
}

export function resolvePaperType(interiorType: string, rawValue: string | undefined): string {
  const options = BOOK_PAPER_TYPES_BY_INTERIOR_TYPE[interiorType] ?? ['White paper']
  if (rawValue && options.includes(rawValue)) return rawValue
  return options[0]
}

export function resolveReadingDirection(rawValue: string | undefined): BookReadingDirection {
  const normalized = rawValue?.toLowerCase()
  if (normalized === 'left to right') return 'Left to right'
  if (normalized === 'right to left') return 'Right to left'
  return DEFAULT_BOOK_READING_DIRECTION
}

export function normalizeProjectBookInfo(
  raw: unknown,
  fallback: ProjectBookInfo = DEFAULT_PROJECT_BOOK_INFO,
): ProjectBookInfo {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fallback
  }

  const record = raw as Record<string, unknown>
  const bindingType = resolveBindingType(
    typeof record.bindingType === 'string' ? record.bindingType : undefined,
  )
  const interiorType = resolveInteriorType(
    bindingType,
    typeof record.interiorType === 'string' ? record.interiorType : undefined,
  )
  const paperType = resolvePaperType(
    interiorType,
    typeof record.paperType === 'string' ? record.paperType : undefined,
  )
  const readingDirection = resolveReadingDirection(
    typeof record.readingDirection === 'string' ? record.readingDirection : undefined,
  )
  const trimBookSize = resolveTrimBookSize(
    typeof record.trimBookSize === 'string' ? record.trimBookSize : undefined,
    fallback.trimBookSize,
  )
  const pageCount = clampBookCoverPageCount(
    typeof record.pageCount === 'number' ? record.pageCount : fallback.pageCount,
  )

  return {
    bindingType,
    interiorType,
    paperType,
    readingDirection,
    trimBookSize,
    pageCount,
  }
}

export function projectBookInfoEquals(a: ProjectBookInfo, b: ProjectBookInfo): boolean {
  return (
    a.bindingType === b.bindingType &&
    a.interiorType === b.interiorType &&
    a.paperType === b.paperType &&
    a.readingDirection === b.readingDirection &&
    a.trimBookSize === b.trimBookSize &&
    a.pageCount === b.pageCount
  )
}
