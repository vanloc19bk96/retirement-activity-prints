import type {
  WordLadderRequest,
  WordLadderResponse,
} from '@/types/studio-word-ladder.types'
import { postStudioJson } from './studio-http'

export function generateWordLadderPairs(
  req: WordLadderRequest,
  signal: AbortSignal,
): Promise<WordLadderResponse> {
  return postStudioJson<WordLadderRequest, WordLadderResponse>({
    path: '/api/studio/word-ladder',
    body: req,
    signal,
    label: 'Word ladder generation',
  })
}
