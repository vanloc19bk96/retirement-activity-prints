import type {
  OfficeAwardsRequest,
  OfficeAwardsResponse,
} from '@/types/studio-office-awards.types'
import { postStudioJson } from './studio-http'

export function generateOfficeAwards(
  req: OfficeAwardsRequest,
  signal: AbortSignal,
): Promise<OfficeAwardsResponse> {
  return postStudioJson<OfficeAwardsRequest, OfficeAwardsResponse>({
    path: '/api/studio/office-awards',
    body: req,
    signal,
    label: 'Office Awards',
  })
}
