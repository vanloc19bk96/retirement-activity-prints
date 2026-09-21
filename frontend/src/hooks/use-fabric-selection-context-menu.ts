import type { RefObject } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

import {
  copyActiveSelection,
  hasCanvasClipboard,
  pasteFromClipboardAtClientPoint,
} from '@/utils/canvas-clipboard'
import { deleteActiveSelection } from '@/utils/canvas-selection'

export function useFabricSelectionContextMenu(canvasRef: RefObject<Canvas | null>): {
  isOpen: boolean
  setOpen: (open: boolean) => void
  anchorPoint: { x: number; y: number }
  openAt: (
    clientX: number,
    clientY: number,
    capabilities: { canCopy: boolean; canDelete: boolean },
  ) => void
  close: () => void
  canPaste: boolean
  canCopy: boolean
  canDelete: boolean
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
} {
  const [isOpen, setOpen] = useState(false)
  const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0 })
  const lastClientPointRef = useRef({ x: 0, y: 0 })
  const [clipboardNotify, setClipboardNotify] = useState(0)
  const [capabilities, setCapabilities] = useState({
    canCopy: false,
    canDelete: false,
  })

  const canPaste = useMemo(
    () => hasCanvasClipboard(),
    [clipboardNotify, isOpen],
  )

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const openAt = useCallback(
    (
      clientX: number,
      clientY: number,
      nextCapabilities: { canCopy: boolean; canDelete: boolean },
    ) => {
      const nextPoint = { x: clientX, y: clientY }
      lastClientPointRef.current = nextPoint
      setAnchorPoint(nextPoint)
      setCapabilities(nextCapabilities)
      setOpen(true)
      setClipboardNotify((n) => n + 1)
    },
    [],
  )

  const onCopy = useCallback(() => {
    if (!capabilities.canCopy) return
    const canvas = canvasRef.current
    if (!canvas) return
    copyActiveSelection(canvas)
    setClipboardNotify((n) => n + 1)
    close()
  }, [capabilities.canCopy, canvasRef, close])

  const onPaste = useCallback(() => {
    if (!hasCanvasClipboard()) return
    const canvas = canvasRef.current
    if (!canvas) return
    const point = lastClientPointRef.current
    pasteFromClipboardAtClientPoint(canvas, point.x, point.y)
    close()
  }, [canvasRef, close])

  const onDelete = useCallback(() => {
    if (!capabilities.canDelete) return
    const canvas = canvasRef.current
    if (!canvas) return
    deleteActiveSelection(canvas)
    close()
  }, [capabilities.canDelete, canvasRef, close])

  return {
    isOpen,
    setOpen,
    anchorPoint,
    openAt,
    close,
    canPaste,
    canCopy: capabilities.canCopy,
    canDelete: capabilities.canDelete,
    onCopy,
    onPaste,
    onDelete,
  }
}
