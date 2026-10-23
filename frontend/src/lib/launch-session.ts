/**
 * The launch token of THIS browser tab.
 *
 * The token names the project the tab edits (hub projects), so it lives in sessionStorage,
 * which every tab has for itself: a second tab opened on another project cannot swap it.
 * localStorage keeps only the latest token, to start a tab opened without a hub link (a
 * bookmark, a typed URL); that tab copies it on first read and stays on its project after.
 */

const TOKEN_KEY = 'launch_token'
const PROJECT_KEY = 'launch_project'

export interface LaunchProject {
  id: string
  name: string | null
}

type TokenRefresher = () => Promise<boolean>

let refresher: TokenRefresher | null = null
let refreshInFlight: Promise<boolean> | null = null

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)?.trim() || null
  } catch {
    return null
  }
}

function writeStorage(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode quotas); the in-memory flow still works.
  }
}

export function getLaunchToken(): string | null {
  const own = readStorage(sessionStorage, TOKEN_KEY)
  if (own) return own
  const latest = readStorage(localStorage, TOKEN_KEY)
  if (latest) writeStorage(sessionStorage, TOKEN_KEY, latest)
  return latest
}

export function setLaunchToken(token: string): void {
  writeStorage(sessionStorage, TOKEN_KEY, token)
  writeStorage(localStorage, TOKEN_KEY, token)
}

export function clearLaunchToken(): void {
  writeStorage(sessionStorage, TOKEN_KEY, null)
  writeStorage(sessionStorage, PROJECT_KEY, null)
  writeStorage(localStorage, TOKEN_KEY, null)
}

export function getLaunchProject(): LaunchProject | null {
  const raw = readStorage(sessionStorage, PROJECT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LaunchProject>
    return typeof parsed.id === 'string' ? { id: parsed.id, name: parsed.name ?? null } : null
  } catch {
    return null
  }
}

export function setLaunchProject(project: LaunchProject | null): void {
  writeStorage(sessionStorage, PROJECT_KEY, project ? JSON.stringify(project) : null)
}

/** Authorization header for the tab's token (undefined without one). */
export function launchAuthHeaders(): Record<string, string> | undefined {
  const token = getLaunchToken()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

/** Registered by the auth client; `launchFetch` calls it once on a 401. */
export function setLaunchTokenRefresher(fn: TokenRefresher): void {
  refresher = fn
}

function refreshOnce(): Promise<boolean> {
  if (!refresher) return Promise.resolve(false)
  // Parallel requests failing together share one refresh.
  refreshInFlight ??= refresher().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

function withCurrentToken(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers)
  const token = getLaunchToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.delete('X-User-Id')
  return { ...init, headers }
}

/**
 * `fetch` for this app's API: sends the tab's current token and, when it has expired
 * (401), refreshes it once and retries, so a save after a long idle does not fail.
 */
export async function launchFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, withCurrentToken(init))
  if (response.status !== 401) return response
  const refreshed = await refreshOnce()
  if (!refreshed) return response
  return fetch(input, withCurrentToken(init))
}
