import type {
  PhraseFinderRequest,
  PhraseFinderResponse,
} from '@/types/studio-phrase-finder.types'
import { postStudioJson } from './studio-http'

export function generatePhraseFinder(
  req: PhraseFinderRequest,
  signal: AbortSignal,
): Promise<PhraseFinderResponse> {
  return postStudioJson<PhraseFinderRequest, PhraseFinderResponse>({
    path: '/api/studio/phrase-finder',
    body: req,
    signal,
    label: 'Phrase Finder generation',
  })
}
