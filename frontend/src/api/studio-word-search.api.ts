import type {
  WordSearchRequest,
  WordSearchResponse,
} from '@/types/studio-word-search.types'
import { postStudioJson } from './studio-http'

export function generateWordSearchWords(
  req: WordSearchRequest,
  signal: AbortSignal,
): Promise<WordSearchResponse> {
  return postStudioJson<WordSearchRequest, WordSearchResponse>({
    path: '/api/studio/word-search',
    body: req,
    signal,
    label: 'Word search',
  })
}
