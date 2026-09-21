export type FabricCanvasDataJson = Record<string, unknown>

export type CanvasType = 'interior' | 'cover'

export interface SaveCanvasItem {
  page_index: number
  canvas_type: CanvasType
  canvas_data: FabricCanvasDataJson
}

export interface SaveCanvasesRequest {
  canvases: SaveCanvasItem[]
  interior_page_count: number
  /** All image URLs on every page + cover; backend prunes orphan `processed/` objects. */
  referenced_supabase_image_public_urls: string[]
}

export interface SavedCanvasItem {
  page_index: number
}

export interface SaveCanvasesResponse {
  project_id: string
  saved: SavedCanvasItem[]
}

export interface LoadedCanvasItem {
  canvas_type: CanvasType
  page_index: number
  canvas_data: FabricCanvasDataJson
}

export interface GetCanvasesResponse {
  project_id: string
  canvases: LoadedCanvasItem[]
}

