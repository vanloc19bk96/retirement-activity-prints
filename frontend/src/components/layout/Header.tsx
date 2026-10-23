import { memo, useCallback, useEffect, useState } from 'react'
import { Shapes } from 'lucide-react'
import { useAuthContext } from '@/context/AuthContext'
import {
  DEFAULT_NICHE_VAULT_URL,
  DEFAULT_PROMOTIONAL_PACK_URL,
  DEFAULT_PRO_UPGRADE_URL,
  DEFAULT_STANDARD_UPGRADE_URL,
  DEFAULT_STARTER_URL,
} from '@/constants/plan-features'
import { useCurrentProject } from '@/hooks/use-current-project'
import { getHubUrl } from '@/services/auth.service'
import { isProPlan, isStarterPlan, normalizeUserPlan } from '@/utils/user-plan'
import { HeaderDialogActions } from './header-dialog-actions'
import { HeaderProjectTitle } from './HeaderProjectTitle'
import { UserMenu } from './UserMenu'

const STARTER_URL = import.meta.env.VITE_STARTER_URL || DEFAULT_STARTER_URL
const STANDARD_UPGRADE_URL =
  import.meta.env.VITE_STANDARD_UPGRADE_URL || DEFAULT_STANDARD_UPGRADE_URL
const PRO_UPGRADE_URL = import.meta.env.VITE_PRO_UPGRADE_URL || DEFAULT_PRO_UPGRADE_URL
const PROMOTIONAL_PACK_URL =
  import.meta.env.VITE_PROMOTIONAL_PACK_URL || DEFAULT_PROMOTIONAL_PACK_URL
const NICHE_VAULT_URL = import.meta.env.VITE_NICHE_VAULT_URL || DEFAULT_NICHE_VAULT_URL

function hubProjectsUrl(): string | null {
  const hubUrl = getHubUrl().trim().replace(/\/+$/, '')
  return hubUrl ? `${hubUrl}/projects` : null
}

function HeaderComponent(): JSX.Element {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const { user, logout } = useAuthContext()
  const { project, rename } = useCurrentProject(Boolean(user))

  const applyTheme = (shouldUseDark: boolean): void => {
    const root = document.documentElement

    if (shouldUseDark) {
      root.classList.add('dark')
      window.localStorage.setItem('theme', 'dark')
      return
    }

    root.classList.remove('dark')
    window.localStorage.setItem('theme', 'light')
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedTheme = window.localStorage.getItem('theme')
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches

    const shouldUseDark = storedTheme === 'dark' || (!storedTheme && prefersDark)
    setIsDarkMode(shouldUseDark)
    applyTheme(shouldUseDark)
  }, [])

  const handleThemeChange = useCallback((checked: boolean): void => {
    setIsDarkMode(checked)
    applyTheme(checked)
  }, [])

  const userDisplayName = user?.full_name?.trim() || user?.email?.split('@')[0] || 'User'
  const userPlan = user?.plan ?? null
  const normalizedPlan = normalizeUserPlan(userPlan)
  const isUserOnProPlan = isProPlan(normalizedPlan)
  const isUserOnStarterPlan = isStarterPlan(normalizedPlan)
  const isUserOnStandardPlan =
    normalizedPlan === 'standard' || normalizedPlan === 'premium'
  const shouldShowUpgradeButton =
    Boolean(user) && (isUserOnStarterPlan || isUserOnStandardPlan) && !isUserOnProPlan

  // The header keeps its ink gradient in both themes, so its controls always use light-on-dark styles.
  const isBlueHeaderSurface = true

  return (
    <header className="app-header px-4 py-3 sm:px-6">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="app-logo-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-md ring-1 ring-white/25"
            aria-hidden
          >
            <Shapes className="h-4 w-4 text-white" />
          </span>
          <HeaderProjectTitle
            appName="Retirement Activity Prints"
            project={project}
            projectsUrl={project ? hubProjectsUrl() : null}
            isBlueHeaderSurface={isBlueHeaderSurface}
            onRename={rename}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <HeaderDialogActions
            shouldShowUpgradeButton={shouldShowUpgradeButton}
            isBlueHeaderSurface={isBlueHeaderSurface}
            userPlan={userPlan}
            starterUrl={STARTER_URL}
            standardUpgradeUrl={STANDARD_UPGRADE_URL}
            proUpgradeUrl={PRO_UPGRADE_URL}
            promotionalPackUrl={PROMOTIONAL_PACK_URL}
            nicheVaultUrl={NICHE_VAULT_URL}
          />

          <UserMenu
            name={userDisplayName}
            plan={userPlan}
            isDarkMode={isDarkMode}
            onDarkModeChange={handleThemeChange}
            onLogout={logout}
            isOnBlueHeader={isBlueHeaderSurface}
          />
        </div>
      </div>
    </header>
  )
}

export const Header = memo(HeaderComponent)
