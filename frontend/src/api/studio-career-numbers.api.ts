import type {
  CareerNumbersRequest,
  CareerNumbersResponse,
} from '@/types/studio-career-numbers.types'
import { postStudioJson } from './studio-http'

export function generateCareerNumbers(
  req: CareerNumbersRequest,
  signal: AbortSignal,
): Promise<CareerNumbersResponse> {
  return postStudioJson<CareerNumbersRequest, CareerNumbersResponse>({
    path: '/api/studio/career-numbers',
    body: req,
    signal,
    label: 'Career By the Numbers',
  })
}
