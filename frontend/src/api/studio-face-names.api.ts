import type {
  FaceNameRequest,
  FaceNameResponse,
} from '@/types/studio-face-names.types'
import { postStudioJson } from './studio-http'

export function generateFaceNames(
  req: FaceNameRequest,
  signal: AbortSignal,
): Promise<FaceNameResponse> {
  return postStudioJson<FaceNameRequest, FaceNameResponse>({
    path: '/api/studio/face-names',
    body: req,
    signal,
    label: 'Face name generation',
  })
}
