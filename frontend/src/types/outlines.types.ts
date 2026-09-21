export interface OutlineAsset {
  id: string
  collectionId: string | null
  title: string
  slug: string
  tags: string[]
  imagePublicUrl: string
  thumbnailPublicUrl: string | null
}

export interface ListOutlineAssetsResponse {
  items: OutlineAsset[]
  nextOffset: number | null
  hasMore: boolean
}
