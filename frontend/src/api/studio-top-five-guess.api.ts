import type {
  TopFiveGuessRequest,
  TopFiveGuessResponse,
} from '@/types/studio-top-five-guess.types'
import { postStudioJson } from './studio-http'

export function generateTopFiveGuess(
  req: TopFiveGuessRequest,
  signal: AbortSignal,
): Promise<TopFiveGuessResponse> {
  return postStudioJson<TopFiveGuessRequest, TopFiveGuessResponse>({
    path: '/api/studio/top-five-guess',
    body: req,
    signal,
    label: 'Top Five Guess',
  })
}
