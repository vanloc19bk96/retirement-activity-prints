import type {
  WeeksOfFirstsRequest,
  WeeksOfFirstsResponse,
} from '@/types/studio-weeks-of-firsts.types'
import { postStudioJson } from './studio-http'

export function generateWeeksOfFirsts(
  req: WeeksOfFirstsRequest,
  signal: AbortSignal,
): Promise<WeeksOfFirstsResponse> {
  return postStudioJson<WeeksOfFirstsRequest, WeeksOfFirstsResponse>({
    path: '/api/studio/weeks-of-firsts',
    body: req,
    signal,
    label: '52 Weeks of Firsts',
  })
}
