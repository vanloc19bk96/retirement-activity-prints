import type { GenerateTraceImagePayload } from '@/types/trace-image.types'

export const REQUEST_TRACE_IMAGE_GENERATION_EVENT = 'canvas:request-trace-image-generation'

export type RequestTraceImageGenerationEventDetail = {
  payload: Omit<GenerateTraceImagePayload, 'imageUrl' | 'replaceImageUrl'>
  resolve: () => void
  reject: (error: Error) => void
}
