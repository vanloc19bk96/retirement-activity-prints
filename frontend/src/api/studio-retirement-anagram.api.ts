import type {
  RetirementAnagramRequest,
  RetirementAnagramResponse,
} from '@/types/studio-retirement-anagram.types'
import { postStudioJson } from './studio-http'

export function generateRetirementAnagram(
  req: RetirementAnagramRequest,
  signal: AbortSignal,
): Promise<RetirementAnagramResponse> {
  return postStudioJson<RetirementAnagramRequest, RetirementAnagramResponse>({
    path: '/api/studio/retirement-anagram',
    body: req,
    signal,
    label: 'Retirement anagram generation',
  })
}
