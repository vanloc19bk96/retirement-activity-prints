import type { PageSizeLabel, SolutionsPerPage } from '@/types/canvas-settings.types'
import type {
  BookBindingType,
  BookReadingDirection,
} from '@/constants/book-information.constants'

export interface ProjectBookInfo {
  bindingType: BookBindingType
  interiorType: string
  paperType: string
  readingDirection: BookReadingDirection
  /** Trim size for cover calculations; independent from interior project settings. */
  trimBookSize: PageSizeLabel
  pageCount: number
}

export interface ProjectSettings {
  pageSizeLabel: PageSizeLabel
  addBleed: boolean
  showVisualGuide: boolean
  /** Group studio solution pages at the end of the book instead of after each game. */
  solutionsAtEnd: boolean
  /** Solutions per page once they sit at the end of the book (1, 2 or 4). */
  solutionsPerPage: SolutionsPerPage
  bookInfo?: ProjectBookInfo
}

export interface SaveProjectSettingsResponse {
  user_id: string
  settings: ProjectSettings
}

export interface PageSizeOption {
  label: string
  min_plan: string
  sort_order: number
  is_locked: boolean
}

export interface ListPageSizeOptionsResponse {
  options: PageSizeOption[]
}


/** The project an editor tab works on; `name` comes from the hub. */
export interface CurrentProject {
  id: string
  name: string | null
  is_hub_project: boolean
}
