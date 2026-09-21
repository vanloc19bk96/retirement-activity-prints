export interface DownloadQuota {
  monthly_downloads_used: number
  monthly_download_limit: number | null
  monthly_downloads_remaining: number | null
  is_unlimited: boolean
  can_download: boolean
}

export type ConsumeDownloadQuotaResponse = DownloadQuota

export interface CreatePdfMergeSessionResponse {
  session_id: string
}
