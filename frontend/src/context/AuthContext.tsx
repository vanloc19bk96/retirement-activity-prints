import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authService, verifyLaunchTokenFromUrl, tryVerifyStoredToken } from '@/services/auth.service'
import type { User } from '@/types/auth'

const REFRESH_INTERVAL_MS = 4 * 60 * 1000

interface AuthContextValue {
  user: User | null
  loading: boolean
  refreshUserData: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(authService.getStoredUser())
  const [loading, setLoading] = useState(true)

  const refreshUserData = useCallback(async () => {
    try {
      const updatedUser = await authService.fetchAndUpdateUser()
      setUser(updatedUser)
    } catch {
      setUser(null)
      localStorage.removeItem('user')
    }
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const fromUrl = await verifyLaunchTokenFromUrl()
      if (cancelled) return

      let hasToken = fromUrl
      if (!fromUrl) {
        hasToken = await tryVerifyStoredToken()
      }

      if (cancelled) return

      if (hasToken) {
        try {
          const u = await authService.fetchAndUpdateUser()
          if (!cancelled) setUser(u)
        } catch {
          if (!cancelled) setUser(null)
        }
      } else {
        if (!cancelled) setUser(null)
      }

      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const intervalId = window.setInterval(async () => {
      const isSessionValid = await authService.ensureValidSession()
      if (!isSessionValid) return

      try {
        const updatedUser = authService.getStoredUser()
        if (updatedUser) setUser(updatedUser)
      } catch {
        // Ignore periodic refresh read failures and keep current user state.
      }
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [user])

  const value: AuthContextValue = {
    user,
    loading,
    refreshUserData,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}

