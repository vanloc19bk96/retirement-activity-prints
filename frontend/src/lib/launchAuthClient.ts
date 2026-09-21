import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import type { User, VerifyLaunchTokenResponse, RefreshLaunchTokenResponse } from '@/types/auth'

const SKIP_UNSAVED_WARNING_ONCE_KEY = 'skip_unsaved_warning_once'

export interface LaunchAuthConfig {
  apiBaseUrl: string
  hubUrl?: string
  launchTokenKey?: string
  /** Path for verifying launch token (POST). Default: '/api/auth/verify-launch-token' */
  verifyPath?: string
  /** Path for refreshing launch token (POST). Default: '/api/auth/refresh-launch-token' */
  refreshPath?: string
  /** Route to redirect when auth fails / logout. Default: '/open-from-hub' */
  loginPath?: string
  /** Optional hook when logout triggered (e.g. use router instead of hard redirect) */
  onLogout?: () => void
}

export function createLaunchAuthClient(config: LaunchAuthConfig): {
  api: AxiosInstance
  authService: {
    verifyLaunchToken: (token: string) => Promise<boolean>
    verifyLaunchTokenFromUrl: () => Promise<boolean>
    refreshLaunchToken: () => Promise<boolean>
    tryVerifyStoredToken: () => Promise<boolean>
    getHubUrl: () => string
    getCurrentUser: () => Promise<User>
    fetchAndUpdateUser: () => Promise<User>
    logout: () => Promise<void>
    isAuthenticated: () => boolean
    getStoredUser: () => User | null
    updateStoredUser: (user: User) => void
    ensureValidSession: () => Promise<boolean>
  }
} {
  const {
    apiBaseUrl,
    hubUrl = '',
    launchTokenKey = 'launch_token',
    verifyPath = '/api/auth/verify-launch-token',
    refreshPath = '/api/auth/refresh-launch-token',
    loginPath = '/open-from-hub',
    onLogout,
  } = config

  const api = axios.create({
    baseURL: apiBaseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: false,
  })

  type RetriableRequestConfig = AxiosRequestConfig & { _retried?: boolean }

  api.interceptors.request.use(
    (requestConfig) => {
      const token = localStorage.getItem(launchTokenKey)
      if (token) {
        requestConfig.headers = requestConfig.headers ?? {}
        requestConfig.headers.Authorization = `Bearer ${token}`
      }
      return requestConfig
    },
    (error) => Promise.reject(error),
  )

  function isRefreshRequest(requestConfig: AxiosRequestConfig | undefined): boolean {
    if (!requestConfig?.url) return false
    const fullUrl = `${requestConfig.baseURL || ''}${requestConfig.url}`
    return fullUrl.includes('refresh-launch-token')
  }

  const performLogout = () => {
    sessionStorage.setItem(SKIP_UNSAVED_WARNING_ONCE_KEY, '1')
    localStorage.removeItem(launchTokenKey)
    localStorage.removeItem('user')
    if (onLogout) {
      onLogout()
    } else {
      window.location.href = loginPath
    }
  }

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status !== 401) return Promise.reject(error)

      const requestConfig = error.config as RetriableRequestConfig | undefined
      if (!requestConfig) {
        performLogout()
        return Promise.reject(error)
      }

      if (isRefreshRequest(requestConfig) || requestConfig._retried) {
        performLogout()
        return Promise.reject(error)
      }

      const token = localStorage.getItem(launchTokenKey)
      if (token?.trim()) {
        try {
          const { data } = await api.post<RefreshLaunchTokenResponse>(refreshPath, {
            token: token.trim(),
          })

          if (data?.token && data?.user) {
            localStorage.setItem(launchTokenKey, data.token)
            localStorage.setItem('user', JSON.stringify(data.user))

            requestConfig._retried = true
            const existingHeaders = (requestConfig.headers ?? {}) as Record<string, string>
            requestConfig.headers = { ...existingHeaders, Authorization: `Bearer ${data.token}` }

            return api.request(requestConfig)
          }
        } catch {
          // Ignore refresh failures and force logout below
        }
      }

      performLogout()
      return Promise.reject(error)
    },
  )

  function readLaunchTokenFromUrl(): string | null {
    const searchParams = new URLSearchParams(window.location.search)
    const tokenFromSearch = searchParams.get('lk')
    if (tokenFromSearch?.trim()) return tokenFromSearch.trim()

    const hash = window.location.hash || ''
    const hashWithoutPrefix = hash.startsWith('#') ? hash.slice(1) : hash
    if (!hashWithoutPrefix) return null

    // Support:
    // - '#lk=...'
    // - '#/some-route?lk=...'
    // - '#x=1&lk=...'
    if (hashWithoutPrefix.startsWith('lk=')) {
      const params = new URLSearchParams(hashWithoutPrefix)
      return params.get('lk')?.trim() || null
    }

    const queryIndex = hashWithoutPrefix.indexOf('?')
    if (queryIndex >= 0) {
      const queryPart = hashWithoutPrefix.slice(queryIndex + 1)
      const params = new URLSearchParams(queryPart)
      return params.get('lk')?.trim() || null
    }

    const params = new URLSearchParams(hashWithoutPrefix)
    return params.get('lk')?.trim() || null
  }

  function stripLaunchTokenFromUrl(): void {
    const url = new URL(window.location.href)
    url.searchParams.delete('lk')

    const originalHash = url.hash || ''
    const hashWithoutPrefix = originalHash.startsWith('#') ? originalHash.slice(1) : originalHash
    let newHash = originalHash

    if (!hashWithoutPrefix) {
      newHash = ''
    } else if (hashWithoutPrefix.startsWith('lk=')) {
      const params = new URLSearchParams(hashWithoutPrefix)
      params.delete('lk')
      const newQuery = params.toString()
      newHash = newQuery ? `#${newQuery}` : ''
    } else {
      const queryIndex = hashWithoutPrefix.indexOf('?')
      if (queryIndex >= 0) {
        const pathPart = hashWithoutPrefix.slice(0, queryIndex)
        const queryPart = hashWithoutPrefix.slice(queryIndex + 1)
        const params = new URLSearchParams(queryPart)
        params.delete('lk')
        const newQuery = params.toString()
        newHash = newQuery ? `#${pathPart}?${newQuery}` : `#${pathPart}`
      } else {
        // Hash-only querystring case (e.g. '#x=1&lk=2')
        const params = new URLSearchParams(hashWithoutPrefix)
        if (params.has('lk')) {
          params.delete('lk')
          const newQuery = params.toString()
          newHash = newQuery ? `#${newQuery}` : ''
        }
      }
    }

    window.history.replaceState(null, '', url.pathname + url.search + newHash)
  }

  async function verifyLaunchToken(token: string): Promise<boolean> {
    const trimmed = token?.trim()
    if (!trimmed) return false

    try {
      const { data } = await api.post<VerifyLaunchTokenResponse>(verifyPath, { token: trimmed })
      if (data?.user) {
        localStorage.setItem(launchTokenKey, trimmed)
        localStorage.setItem('user', JSON.stringify(data.user))
        return true
      }
    } catch (err) {
      console.error('Failed to verify launch token:', err)
    }

    return false
  }

  async function verifyLaunchTokenFromUrl(): Promise<boolean> {
    const token = readLaunchTokenFromUrl()
    if (!token?.trim()) return false

    const ok = await verifyLaunchToken(token)
    if (!ok) return false

    stripLaunchTokenFromUrl()
    return true
  }

  async function refreshLaunchToken(): Promise<boolean> {
    const token = localStorage.getItem(launchTokenKey)
    if (!token?.trim()) return false

    try {
      const { data } = await api.post<RefreshLaunchTokenResponse>(refreshPath, {
        token: token.trim(),
      })

      if (data?.token && data?.user) {
        localStorage.setItem(launchTokenKey, data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        return true
      }
    } catch {
      // Ignore refresh failures; caller will handle false
    }

    return false
  }

  async function tryVerifyStoredToken(): Promise<boolean> {
    const token = localStorage.getItem(launchTokenKey)
    if (!token?.trim()) return false

    try {
      const { data } = await api.post<VerifyLaunchTokenResponse>(verifyPath, { token: token.trim() })
      if (data?.user) {
        localStorage.setItem('user', JSON.stringify(data.user))
        return true
      }
    } catch {
      const refreshed = await refreshLaunchToken()
      if (refreshed) {
        return true
      }

      localStorage.removeItem(launchTokenKey)
      localStorage.removeItem('user')
    }

    return false
  }

  async function ensureValidSession(): Promise<boolean> {
    const token = localStorage.getItem(launchTokenKey)
    if (!token?.trim()) return false

    const refreshed = await refreshLaunchToken()
    if (!refreshed) return false

    try {
      await fetchAndUpdateUser()
      return true
    } catch {
      return false
    }
  }

  function getHubUrl(): string {
    return hubUrl || ''
  }

  async function getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/api/auth/me')
    return response.data
  }

  async function fetchAndUpdateUser(): Promise<User> {
    const response = await api.get<User>('/api/auth/me')
    const userData = response.data
    localStorage.setItem('user', JSON.stringify(userData))
    return userData
  }

  async function logout(): Promise<void> {
    performLogout()
  }

  function isAuthenticated(): boolean {
    if (getStoredUser()) return true
    return !!localStorage.getItem(launchTokenKey)
  }

  function getStoredUser(): User | null {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        return JSON.parse(userStr) as User
      } catch {
        return null
      }
    }

    return null
  }

  function updateStoredUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user))
  }

  return {
    api,
    authService: {
      verifyLaunchToken,
      verifyLaunchTokenFromUrl,
      refreshLaunchToken,
      tryVerifyStoredToken,
      getHubUrl,
      getCurrentUser,
      fetchAndUpdateUser,
      logout,
      isAuthenticated,
      getStoredUser,
      updateStoredUser,
      ensureValidSession,
    },
  }
}

