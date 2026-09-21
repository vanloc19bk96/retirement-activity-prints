import type { User } from '@/types/auth'
import { createLaunchAuthClient } from '@/lib/launchAuthClient'

// Empty base URL routes auth through Vite /api proxy
const API_URL = import.meta.env.VITE_API_URL ?? ''
const HUB_URL = import.meta.env.VITE_HUB_URL || ''

const { api, authService: coreAuthService } = createLaunchAuthClient({
  apiBaseUrl: API_URL,
  hubUrl: HUB_URL,
  launchTokenKey: 'launch_token',
  verifyPath: '/api/auth/verify-launch-token',
  refreshPath: '/api/auth/refresh-launch-token',
  loginPath: '/open-from-hub',
})

export const verifyLaunchTokenFromUrl = coreAuthService.verifyLaunchTokenFromUrl
export const tryVerifyStoredToken = coreAuthService.tryVerifyStoredToken
export const getHubUrl = coreAuthService.getHubUrl

export const authService = {
  ...coreAuthService,
  async fetchAndUpdateUser(): Promise<User> {
    return coreAuthService.fetchAndUpdateUser()
  },
}

export default api

