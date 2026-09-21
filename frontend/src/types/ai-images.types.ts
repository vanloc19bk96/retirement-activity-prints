export type GeneratedImage = {
  idea?: string | null
  publicUrl: string
  bucket: string
  path: string
}

export type GenerateInteriorImagesPayload = {
  idea: string
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
