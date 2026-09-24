import type {
  TwoTruthsFibRequest,
  TwoTruthsFibResponse,
} from '@/types/studio-two-truths-fib.types'
import { postStudioJson } from './studio-http'

export function generateTwoTruthsFib(
  req: TwoTruthsFibRequest,
  signal: AbortSignal,
): Promise<TwoTruthsFibResponse> {
  return postStudioJson<TwoTruthsFibRequest, TwoTruthsFibResponse>({
    path: '/api/studio/two-truths-and-a-fib',
    body: req,
    signal,
    label: 'Two Truths and a Fib',
  })
}
