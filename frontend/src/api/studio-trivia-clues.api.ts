import type {
  TriviaCluesRequest,
  TriviaCluesResponse,
} from '@/types/studio-trivia-clues.types'
import { postStudioJson } from './studio-http'

export function generateTriviaClues(
  req: TriviaCluesRequest,
  signal: AbortSignal,
): Promise<TriviaCluesResponse> {
  return postStudioJson<TriviaCluesRequest, TriviaCluesResponse>({
    path: '/api/studio/trivia-clue-word-search',
    body: req,
    signal,
    label: 'Trivia clue word search',
  })
}
