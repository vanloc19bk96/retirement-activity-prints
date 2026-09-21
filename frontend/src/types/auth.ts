export interface User {
  id: number
  email: string
  full_name: string | null
  plan: string | null
  created_at: string
  monthly_downloads_used?: number
  monthly_download_limit?: number | null
  monthly_downloads_remaining?: number | null
  is_unlimited_downloads?: boolean
  /**
   * 128-bit per-account puzzle salt, hex encoded (`users.puzzle_salt`).
   *
   * Keys the HMAC that derives puzzle seeds, so two sellers running identical
   * settings never generate the same puzzle — the primary guard against a
   * duplicate-content flag on KDP. Absent for guests and for accounts that
   * predate the migration; generators then fall back to a digest of the owner
   * key, which still separates accounts.
   */
  puzzle_salt?: string | null
}

export interface ErrorResponse {
  detail: string
}

/** Response after verifying launch token with hub (client stores token in localStorage). */
export interface VerifyLaunchTokenResponse {
  user: User
  hub_url: string | null
}

/** Response after refreshing launch token; client stores new token and user. */
export interface RefreshLaunchTokenResponse {
  token: string
  user: User
}

