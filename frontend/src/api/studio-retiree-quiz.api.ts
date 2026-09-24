import type {
  RetireeQuizRequest,
  RetireeQuizResponse,
} from '@/types/studio-retiree-quiz.types'
import { postStudioJson } from './studio-http'

export function generateRetireeQuiz(
  req: RetireeQuizRequest,
  signal: AbortSignal,
): Promise<RetireeQuizResponse> {
  return postStudioJson<RetireeQuizRequest, RetireeQuizResponse>({
    path: '/api/studio/what-kind-of-retiree',
    body: req,
    signal,
    label: 'What Kind of Retiree',
  })
}
