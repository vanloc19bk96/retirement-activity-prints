import type { AiImageSize, AiImageType } from '@/types/ai-images.types'
import type { GenerateCoverPayload } from '@/types/cover.types'
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

/** An image generated for the project. `url` is the print file; `previewUrl` is its light copy, when one exists. */
export interface AiGeneratedImage {
  url: string
  previewUrl: string | null
  idea: string | null
  kind: 'interior' | 'cover'
}

/** What the AI image form holds for a project, kept so it survives closing the editor. */
export interface AiImageDraft {
  isBookCoverMode: boolean
  idea: string
  imageType: AiImageType
  imageSize: AiImageSize
  cover: Pick<GenerateCoverPayload, 'description' | 'imageType' | 'title' | 'subtitle' | 'author'>
  /** Every image generated for the project, newest first. */
  generatedImages: AiGeneratedImage[]
  /** The image the form shows; the next three fields are also read by older clients. */
  generatedImageUrl: string | null
  generatedImageIdea: string | null
  generatedCoverImageUrl: string | null
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
