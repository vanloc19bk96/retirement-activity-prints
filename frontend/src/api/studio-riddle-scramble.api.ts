import type {
  RiddleScrambleRequest,
  RiddleScrambleResponse,
} from '@/types/studio-riddle-scramble.types'
import { postStudioJson } from './studio-http'

export function generateRiddleScramble(
  req: RiddleScrambleRequest,
  signal: AbortSignal,
): Promise<RiddleScrambleResponse> {
  return postStudioJson<RiddleScrambleRequest, RiddleScrambleResponse>({
    path: '/api/studio/riddle-scramble',
    body: req,
    signal,
    label: 'Riddle scramble generation',
  })
}
