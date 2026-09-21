import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CreateNewProjectDialogProps {
  isOpen: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  onConfirm: () => void
}

export function CreateNewProjectDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: CreateNewProjectDialogProps): JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle>Create new project?</DialogTitle>
          <DialogDescription>
            This will clear the cover and all pages, then save automatically. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            aria-label="Cancel create new project"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
            aria-label="Confirm create new project, clear all content, and save"
          >
            Create new project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
