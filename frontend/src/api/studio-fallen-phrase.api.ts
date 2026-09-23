import type {
  FallenPhraseRequest,
  FallenPhraseResponse,
} from '@/types/studio-fallen-phrase.types'
import { postStudioJson } from './studio-http'

export function generateFallenPhrase(
  req: FallenPhraseRequest,
  signal: AbortSignal,
): Promise<FallenPhraseResponse> {
  return postStudioJson<FallenPhraseRequest, FallenPhraseResponse>({
    path: '/api/studio/fallen-phrase',
    body: req,
    signal,
    label: 'Fallen phrase generation',
  })
}
