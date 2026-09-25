import type {
  OccupationTriviaRequest,
  OccupationTriviaResponse,
} from '@/types/studio-occupation-trivia.types'
import { postStudioJson } from './studio-http'

export function generateOccupationTrivia(
  req: OccupationTriviaRequest,
  signal: AbortSignal,
): Promise<OccupationTriviaResponse> {
  return postStudioJson<OccupationTriviaRequest, OccupationTriviaResponse>({
    path: '/api/studio/occupation-trivia',
    body: req,
    signal,
    label: 'Occupation Trivia Pack',
  })
}
