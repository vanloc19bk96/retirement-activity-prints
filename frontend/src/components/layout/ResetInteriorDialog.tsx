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

interface ResetInteriorDialogProps {
  isOpen: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  onConfirm: () => void
}

export function ResetInteriorDialog({
  isOpen,
  onOpenChange,
  onConfirm,
}: ResetInteriorDialogProps): JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone after you save
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            aria-label="Cancel reset interior pages"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
            aria-label="Confirm reset interior to one empty page"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
