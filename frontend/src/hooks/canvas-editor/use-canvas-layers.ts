import { useCallback, useRef } from 'react'
import type { Canvas, FabricObject } from 'fabric'

import { areLayerListsEqual, readCanvasLayers, type CanvasLayer } from '@/utils/canvas-layers'
import { useCanvasDerivedState } from './use-canvas-derived-state'

export type CanvasLayersApi = {
  layers: CanvasLayer[]
  getObject: (id: string) => FabricObject | null
}

const EMPTY_LAYERS: CanvasLayer[] = []

/** Live layer list for one canvas, frontmost first; rows look their object up by id. */
export function useCanvasLayers(canvas: Canvas | null): CanvasLayersApi {
  const objectsByIdRef = useRef(new Map<string, FabricObject>())

  const read = useCallback((target: Canvas): CanvasLayer[] => {
    const next = readCanvasLayers(target)
    objectsByIdRef.current = next.objectsById
    return next.layers
  }, [])

  const layers = useCanvasDerivedState(canvas, read, areLayerListsEqual, EMPTY_LAYERS)
  const getObject = useCallback((id: string): FabricObject | null => objectsByIdRef.current.get(id) ?? null, [])

  return { layers, getObject }
}
