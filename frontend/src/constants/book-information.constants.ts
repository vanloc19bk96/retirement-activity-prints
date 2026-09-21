export const BOOK_BINDING_TYPES = [
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'paperback', label: 'Paperback' },
] as const

export type BookBindingType = (typeof BOOK_BINDING_TYPES)[number]['value']

export const BOOK_INTERIOR_TYPES_BY_BINDING: Record<BookBindingType, readonly string[]> = {
  hardcover: ['Black & White', 'Premium Color'],
  paperback: ['Black & White', 'Premium Color', 'Standard Color'],
}

export const BOOK_PAPER_TYPES_BY_INTERIOR_TYPE: Record<string, readonly string[]> = {
  'Black & White': ['White paper', 'Cream paper'],
  'Premium Color': ['White paper'],
  'Standard Color': ['White paper'],
}

export const BOOK_READING_DIRECTIONS = ['Left to right', 'Right to left'] as const

export type BookReadingDirection = (typeof BOOK_READING_DIRECTIONS)[number]

export const DEFAULT_BOOK_BINDING_TYPE: BookBindingType = 'paperback'

export const DEFAULT_BOOK_READING_DIRECTION: BookReadingDirection = BOOK_READING_DIRECTIONS[0]

export const KDP_MIN_PAGE_COUNT = 24
export const KDP_MAX_PAGE_COUNT = 830
