import type {
  WouldYouRatherRequest,
  WouldYouRatherResponse,
} from '@/types/studio-would-you-rather.types'
import { postStudioJson } from './studio-http'

export function generateWouldYouRather(
  req: WouldYouRatherRequest,
  signal: AbortSignal,
): Promise<WouldYouRatherResponse> {
  return postStudioJson<WouldYouRatherRequest, WouldYouRatherResponse>({
    path: '/api/studio/would-you-rather',
    body: req,
    signal,
    label: 'Would You Rather',
  })
}
