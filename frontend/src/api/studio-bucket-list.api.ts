import type { BucketListRequest, BucketListResponse } from '@/types/studio-bucket-list.types'
import { postStudioJson } from './studio-http'

export function generateBucketList(
  req: BucketListRequest,
  signal: AbortSignal,
): Promise<BucketListResponse> {
  return postStudioJson<BucketListRequest, BucketListResponse>({
    path: '/api/studio/bucket-list',
    body: req,
    signal,
    label: 'Bucket List',
  })
}
