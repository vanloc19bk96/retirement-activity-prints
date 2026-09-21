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

interface DeletePageDialogProps {
  isOpen: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  pageIndex: number | null
  onConfirm: () => void
}

export function DeletePageDialog({
  isOpen,
  onOpenChange,
  pageIndex,
  onConfirm,
}: DeletePageDialogProps): JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle>Delete page</DialogTitle>
          <DialogDescription>
            {pageIndex !== null
              ? `Are you sure you want to delete Page ${pageIndex + 1}? This cannot be undone.`
              : 'Are you sure you want to delete this page? This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            aria-label="Cancel delete page"
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} aria-label="Confirm delete page">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

