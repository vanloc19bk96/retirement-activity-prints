export type GenerateTraceImagePayload = {
  imageUrl: string
  replaceImageUrl?: string
  lineColor: string
  thickness: number
  dashLength: number
  dashGap: number
  sensitivity: number
}

export type GenerateTraceImageResponse = {
  publicUrl: string
  bucket: string
  path: string
  contoursCount: number
}
