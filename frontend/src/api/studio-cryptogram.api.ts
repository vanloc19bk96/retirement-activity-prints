import type {
  CryptogramRequest,
  CryptogramResponse,
} from '@/types/studio-cryptogram.types'
import { postStudioJson } from './studio-http'

export function generateCryptogram(
  req: CryptogramRequest,
  signal: AbortSignal,
): Promise<CryptogramResponse> {
  return postStudioJson<CryptogramRequest, CryptogramResponse>({
    path: '/api/studio/cryptogram',
    body: req,
    signal,
    label: 'Cryptogram generation',
  })
}
