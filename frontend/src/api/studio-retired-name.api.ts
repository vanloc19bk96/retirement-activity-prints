import type {
  RetiredNameRequest,
  RetiredNameResponse,
} from '@/types/studio-retired-name.types'
import { postStudioJson } from './studio-http'

export function generateRetiredName(
  req: RetiredNameRequest,
  signal: AbortSignal,
): Promise<RetiredNameResponse> {
  return postStudioJson<RetiredNameRequest, RetiredNameResponse>({
    path: '/api/studio/retired-name',
    body: req,
    signal,
    label: 'Retired Name',
  })
}
