import type {
  EverOrNeverRequest,
  EverOrNeverResponse,
} from '@/types/studio-ever-or-never.types'
import { postStudioJson } from './studio-http'

export function generateEverOrNever(
  req: EverOrNeverRequest,
  signal: AbortSignal,
): Promise<EverOrNeverResponse> {
  return postStudioJson<EverOrNeverRequest, EverOrNeverResponse>({
    path: '/api/studio/ever-or-never',
    body: req,
    signal,
    label: 'Ever or Never',
  })
}
