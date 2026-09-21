export interface EmojiAsset {
  id: string
  title: string
  slug: string
  imagePublicUrl: string
}

export interface ListEmojiAssetsResponse {
  items: EmojiAsset[]
  nextOffset: number | null
  hasMore: boolean
}
