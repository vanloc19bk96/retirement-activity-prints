import { memo, useCallback, useState } from 'react'
import { Crown, FilePlus, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { dispatchCreateNewProject } from '@/utils/new-project-events'
import { CreateNewProjectDialog } from './CreateNewProjectDialog'
import { PremiumUpgradeDialog } from './PremiumUpgradeDialog'
import { VideoTrainingDialog } from './VideoTrainingDialog'

/** Flip to true when Video Training should show in the header again. */
const IS_VIDEO_TRAINING_VISIBLE = true

type HeaderDialogActionsProps = {
  shouldShowUpgradeButton: boolean
  isBlueHeaderSurface: boolean
  userPlan: string | null
  standardUpgradeUrl: string
  proUpgradeUrl: string
  promotionalPackUrl: string
}

function HeaderDialogActionsComponent({
  shouldShowUpgradeButton,
  isBlueHeaderSurface,
  userPlan,
  standardUpgradeUrl,
  proUpgradeUrl,
  promotionalPackUrl,
}: HeaderDialogActionsProps): JSX.Element {
  const [isVideoTrainingDialogOpen, setIsVideoTrainingDialogOpen] = useState(false)
  const [shouldMountVideoTrainingDialog, setShouldMountVideoTrainingDialog] = useState(false)
  const [isPremiumUpgradeDialogOpen, setIsPremiumUpgradeDialogOpen] = useState(false)
  const [shouldMountPremiumUpgradeDialog, setShouldMountPremiumUpgradeDialog] = useState(false)
  const [isCreateNewProjectDialogOpen, setIsCreateNewProjectDialogOpen] = useState(false)

  const handleOpenVideoTraining = useCallback((): void => {
    setShouldMountVideoTrainingDialog(true)
    setIsVideoTrainingDialogOpen(true)
  }, [])

  const handleOpenPremiumUpgrade = useCallback((): void => {
    setShouldMountPremiumUpgradeDialog(true)
    setIsPremiumUpgradeDialogOpen(true)
  }, [])

  const handleOpenCreateNewProjectDialog = useCallback((): void => {
    setIsCreateNewProjectDialogOpen(true)
  }, [])

  const handleConfirmCreateNewProject = useCallback((): void => {
    setIsCreateNewProjectDialogOpen(false)
    dispatchCreateNewProject()
  }, [])

  const outlineButtonClassName =
    'h-9 gap-2 ' +
    (isBlueHeaderSurface
      ? 'border-primary-foreground/35 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground'
      : '')

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={outlineButtonClassName}
          onClick={handleOpenCreateNewProjectDialog}
          aria-label="Create new project — clears all pages and cover, then saves"
        >
          <FilePlus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Create new project</span>
          <span className="sm:hidden">New</span>
        </Button>

        {IS_VIDEO_TRAINING_VISIBLE && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={outlineButtonClassName}
            onClick={handleOpenVideoTraining}
            aria-label="Open video training dialog"
          >
            <PlayCircle className="h-4 w-4 shrink-0" />
            <span>Video Training</span>
          </Button>
        )}

        {shouldShowUpgradeButton && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className={
              'h-9 gap-2 ' +
              (isBlueHeaderSurface
                ? 'border-0 bg-primary-foreground text-primary hover:bg-primary-foreground/90'
                : '')
            }
            onClick={handleOpenPremiumUpgrade}
            aria-label="Upgrade plan — opens upgrade options"
          >
            <Crown className="h-4 w-4 shrink-0" aria-hidden />
            <span>Upgrade</span>
          </Button>
        )}
      </div>

      <CreateNewProjectDialog
        isOpen={isCreateNewProjectDialogOpen}
        onOpenChange={setIsCreateNewProjectDialogOpen}
        onConfirm={handleConfirmCreateNewProject}
      />

      {IS_VIDEO_TRAINING_VISIBLE && shouldMountVideoTrainingDialog && (
        <VideoTrainingDialog
          isOpen={isVideoTrainingDialogOpen}
          onOpenChange={setIsVideoTrainingDialogOpen}
        />
      )}
      {shouldMountPremiumUpgradeDialog && (
        <PremiumUpgradeDialog
          isOpen={isPremiumUpgradeDialogOpen}
          onOpenChange={setIsPremiumUpgradeDialogOpen}
          currentPlan={userPlan}
          standardUpgradeUrl={standardUpgradeUrl}
          proUpgradeUrl={proUpgradeUrl}
          promotionalPackUrl={promotionalPackUrl}
        />
      )}
    </>
  )
}

export const HeaderDialogActions = memo(HeaderDialogActionsComponent)
