import type { RollADayRequest, RollADayResponse } from '@/types/studio-roll-a-day.types'
import { postStudioJson } from './studio-http'

export function generateRollADay(
  req: RollADayRequest,
  signal: AbortSignal,
): Promise<RollADayResponse> {
  return postStudioJson<RollADayRequest, RollADayResponse>({
    path: '/api/studio/roll-a-day',
    body: req,
    signal,
    label: 'Roll-a-Day',
  })
}
