import type {
  ThemeWordsRequest,
  ThemeWordsResponse,
} from '@/types/studio-theme-words.types'
import { postStudioJson } from './studio-http'

export function generateThemeWords(
  req: ThemeWordsRequest,
  signal: AbortSignal,
): Promise<ThemeWordsResponse> {
  return postStudioJson<ThemeWordsRequest, ThemeWordsResponse>({
    path: '/api/studio/theme-words',
    body: req,
    signal,
    label: 'Themed word generation',
  })
}
