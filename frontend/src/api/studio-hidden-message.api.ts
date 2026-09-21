import type {
  HiddenMessageRequest,
  HiddenMessageResponse,
} from '@/types/studio-hidden-message.types'
import { postStudioJson } from './studio-http'

export function generateHiddenMessage(
  req: HiddenMessageRequest,
  signal: AbortSignal,
): Promise<HiddenMessageResponse> {
  return postStudioJson<HiddenMessageRequest, HiddenMessageResponse>({
    path: '/api/studio/hidden-message-word-search',
    body: req,
    signal,
    label: 'Hidden message word search',
  })
}
