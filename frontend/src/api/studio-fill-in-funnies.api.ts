import type {
  FillInFunniesRequest,
  FillInFunniesResponse,
} from '@/types/studio-fill-in-funnies.types'
import { postStudioJson } from './studio-http'

export function generateFillInFunnies(
  req: FillInFunniesRequest,
  signal: AbortSignal,
): Promise<FillInFunniesResponse> {
  return postStudioJson<FillInFunniesRequest, FillInFunniesResponse>({
    path: '/api/studio/fill-in-funnies',
    body: req,
    signal,
    label: 'Fill-in Funnies',
  })
}
