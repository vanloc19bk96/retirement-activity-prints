import type {
  WhoKnowsBestRequest,
  WhoKnowsBestResponse,
} from '@/types/studio-who-knows-best.types'
import { postStudioJson } from './studio-http'

export function generateWhoKnowsBest(
  req: WhoKnowsBestRequest,
  signal: AbortSignal,
): Promise<WhoKnowsBestResponse> {
  return postStudioJson<WhoKnowsBestRequest, WhoKnowsBestResponse>({
    path: '/api/studio/who-knows-retiree-best',
    body: req,
    signal,
    label: 'Who Knows the Retiree Best',
  })
}
