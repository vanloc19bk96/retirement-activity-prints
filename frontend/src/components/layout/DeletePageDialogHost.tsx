import { forwardRef, useCallback, useImperativeHandle, useState, type SetStateAction } from 'react'

import { DeletePageDialog } from './DeletePageDialog'

export type DeletePageDialogHostHandle = {
  /** `withSolution`: the page is a game's last, so its answer key goes too. */
  requestDelete: (pageIndex: number, options?: { withSolution?: boolean }) => void
}

type DeletePageDialogHostProps = {
  onConfirmDelete: (pageIndex: number) => void
}

/**
 * Owns delete-dialog UI state so opening or interacting with the dialog does not
 * re-render the full interior page list in MainContent.
 */
export const DeletePageDialogHost = forwardRef<DeletePageDialogHostHandle, DeletePageDialogHostProps>(
  function DeletePageDialogHost({ onConfirmDelete }, ref): JSX.Element {
    const [isOpen, setIsOpen] = useState(false)
    const [pendingPageIndex, setPendingPageIndex] = useState<number | null>(null)
    const [withSolution, setWithSolution] = useState(false)

    useImperativeHandle(
      ref,
      () => ({
        requestDelete(pageIndex, options): void {
          setPendingPageIndex(pageIndex)
          setWithSolution(options?.withSolution ?? false)
          setIsOpen(true)
        },
      }),
      [],
    )

    const handleOpenChange = useCallback((value: SetStateAction<boolean>): void => {
      setIsOpen((prev) => {
        const nextOpen = typeof value === 'function' ? value(prev) : value
        if (!nextOpen) {
          setPendingPageIndex(null)
        }
        return nextOpen
      })
    }, [])

    const handleConfirm = useCallback((): void => {
      if (pendingPageIndex === null) {
        setIsOpen(false)
        return
      }

      onConfirmDelete(pendingPageIndex)
      setIsOpen(false)
      setPendingPageIndex(null)
    }, [onConfirmDelete, pendingPageIndex])

    return (
      <DeletePageDialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        pageIndex={pendingPageIndex}
        withSolution={withSolution}
        onConfirm={handleConfirm}
      />
    )
  },
)
