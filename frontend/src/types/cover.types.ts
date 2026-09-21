export type CoverTextPosition = 'top' | 'center' | 'bottom'
export type AuthorPosition = 'top' | 'bottom'

export type CoverTextField = {
  enabled: boolean
  text: string
  position: CoverTextPosition
}

export type AuthorTextField = {
  enabled: boolean
  text: string
  position: AuthorPosition
}

export type CoverDimensions = {
  widthPx: number
  heightPx: number
  dpi: number
  bleedPx: number
}

export type GenerateCoverPayload = {
  description: string
  title: CoverTextField
  subtitle: CoverTextField
  author: AuthorTextField
  coverDimensions: CoverDimensions
}

export type GenerateCoverResult = {
  imageUrl: string
  generationId: string
}

export type GenerateCoverErrorBody = {
  success: false
  errorCode: 'AI_GENERATION_FAILED' | 'STORAGE_UPLOAD_FAILED' | 'VALIDATION_ERROR'
  message: string
}
