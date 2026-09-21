import { memo } from 'react'
import { ChevronDown, Crown, LogOut, Moon, Sun, UserRound } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

interface UserMenuProps {
  name: string
  plan?: string | null
  isDarkMode: boolean
  onDarkModeChange: (checked: boolean) => void
  onLogout?: () => void
  /** Light header uses `bg-primary`; trigger needs light-on-blue styles. */
  isOnBlueHeader?: boolean
}

function UserMenuComponent({
  name,
  plan,
  isDarkMode,
  onDarkModeChange,
  onLogout,
  isOnBlueHeader = false,
}: UserMenuProps): JSX.Element {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('') || 'U'
  const rawPlan = plan?.trim() || ''
  const normalizedPlanLower = rawPlan.toLowerCase()
  const normalizedPlan =
    normalizedPlanLower === 'starter' || normalizedPlanLower === 'essential' || normalizedPlanLower === 'basic'
      ? 'Starter'
      : rawPlan || 'Starter'
  const themeLabel = isDarkMode ? 'Dark' : 'Light'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={
            'h-9 gap-2 rounded-full px-2 pr-2 sm:rounded-md sm:pr-3 ' +
            (isOnBlueHeader
              ? 'border-primary-foreground/35 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground'
              : '')
          }
          aria-label={`Open user menu for ${name}`}
        >
          <span
            className={
              'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ' +
              (isOnBlueHeader
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-muted text-foreground')
            }
          >
            {initials}
          </span>
          <span className="hidden min-w-0 flex-col items-start text-left sm:flex">
            <span
              className={
                'max-w-[120px] truncate text-xs font-medium leading-tight ' +
                (isOnBlueHeader ? 'text-primary-foreground' : 'text-foreground')
              }
            >
              {name}
            </span>
            <span
              className={
                'text-[11px] leading-tight ' +
                (isOnBlueHeader ? 'text-primary-foreground/75' : 'text-muted-foreground')
              }
            >
              {normalizedPlan}
            </span>
          </span>
          <ChevronDown
            className={
              'hidden h-3.5 w-3.5 sm:block ' +
              (isOnBlueHeader ? 'text-primary-foreground/75' : 'text-muted-foreground')
            }
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-50 w-64 border border-border bg-white text-popover-foreground shadow-lg dark:bg-slate-900"
      >
        <DropdownMenuLabel className="font-normal px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-semibold leading-none">{name}</span>
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted py-0.5 text-[11px] text-muted-foreground">
                <Crown className="h-3 w-3" aria-hidden />
                {normalizedPlan}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-default gap-3 px-3 py-2.5 focus:bg-transparent"
          onSelect={(event) => event.preventDefault()}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden
          >
            {isDarkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span className="text-sm text-foreground">{themeLabel} mode</span>
            <span
              className="inline-flex shrink-0"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Switch
                checked={isDarkMode}
                onCheckedChange={onDarkModeChange}
                aria-label="Toggle dark mode"
              />
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="gap-2 px-3 py-2 text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const UserMenu = memo(UserMenuComponent)

