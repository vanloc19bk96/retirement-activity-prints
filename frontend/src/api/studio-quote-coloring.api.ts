import type {
  QuoteColoringRequest,
  QuoteColoringResponse,
} from '@/types/studio-quote-coloring.types'
import { postStudioJson } from './studio-http'

export function generateQuoteColoring(
  req: QuoteColoringRequest,
  signal: AbortSignal,
): Promise<QuoteColoringResponse> {
  return postStudioJson<QuoteColoringRequest, QuoteColoringResponse>({
    path: '/api/studio/quote-coloring',
    body: req,
    signal,
    label: 'Quote Coloring',
  })
}
