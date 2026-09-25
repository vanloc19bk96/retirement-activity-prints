import type {
  WorkLingoRequest,
  WorkLingoResponse,
} from '@/types/studio-work-lingo.types'
import { postStudioJson } from './studio-http'

export function generateWorkLingo(
  req: WorkLingoRequest,
  signal: AbortSignal,
): Promise<WorkLingoResponse> {
  return postStudioJson<WorkLingoRequest, WorkLingoResponse>({
    path: '/api/studio/work-lingo-match',
    body: req,
    signal,
    label: 'Work Lingo Match',
  })
}
