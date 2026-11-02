export type GeneratedImage = {
  idea?: string | null
  publicUrl: string
  bucket: string
  path: string
}

export type AiImageType =
  | 'none'
  | 'coloring'
  | 'mandala'
  | 'ink'
  | 'sketch'
  | 'silhouette'
  | 'illustration'
  | 'cartoon'
  | 'storybook'
  | 'vintage'
  | 'clipart'
  | 'watercolor'
  | 'oil_painting'
  | 'photo'
  | 'render_3d'
  | 'pattern'
  | 'page_border'
  | 'background'

export type AiImageSize = 'square' | 'full_page'

export type GenerateInteriorImagesPayload = {
  idea: string
  imageType: AiImageType
  imageSize: AiImageSize
  pageWidthInches: number
  pageHeightInches: number
}

export type GenerateImagesApiResponse = {
  mode: 'interior'
  images: Array<{
    idea?: string | null
    public_url: string
    bucket: string
    path: string
  }>
}

export type AiImageJobAcceptedApiResponse = {
  job_id: string
  status: 'queued'
}

export type AiImageJobStatusApiResponse = {
  job_id: string
  status: 'queued' | 'started' | 'finished' | 'failed'
  result?: GenerateImagesApiResponse | null
  error?: string | null
}

export type GenerateInteriorImagesResult = {
  images: GeneratedImage[]
}
