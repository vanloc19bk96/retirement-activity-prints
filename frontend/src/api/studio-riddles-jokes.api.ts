import type {
  RiddlesJokesRequest,
  RiddlesJokesResponse,
} from '@/types/studio-riddles-jokes.types'
import { postStudioJson } from './studio-http'

export function generateRiddlesJokes(
  req: RiddlesJokesRequest,
  signal: AbortSignal,
): Promise<RiddlesJokesResponse> {
  return postStudioJson<RiddlesJokesRequest, RiddlesJokesResponse>({
    path: '/api/studio/riddles-and-jokes',
    body: req,
    signal,
    label: 'Riddles & Jokes',
  })
}
