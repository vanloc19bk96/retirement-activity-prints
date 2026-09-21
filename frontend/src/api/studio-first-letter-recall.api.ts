import type {
  FirstLetterRecallRequest,
  FirstLetterRecallResponse,
} from '@/types/studio-first-letter-recall.types'
import { postStudioJson } from './studio-http'

export function generateFirstLetterExamples(
  req: FirstLetterRecallRequest,
  signal: AbortSignal,
): Promise<FirstLetterRecallResponse> {
  return postStudioJson<FirstLetterRecallRequest, FirstLetterRecallResponse>({
    path: '/api/studio/first-letter-recall',
    body: req,
    signal,
    label: 'First letter recall generation',
  })
}
