export interface FontFamilyOption {
  name: string
  value: string
  isWebSafe: boolean
  googleFamily?: string
  localFilePath?: string
  localFontFilesByWeight?: {
    semiBold?: string
    bold?: string
  }
  localFontFilesByStyle?: {
    italic?: string
    boldItalic?: string
  }
  /** When false, hidden from toolbar font picker (existing canvas text still resolves). */
  showInToolbar?: boolean
  /** When true, export uses only the exact weight tier (no within-family fallback). */
  strictWeightExport?: boolean
  /**
   * Full CSS font-family stack for Fabric/canvas. Use when the primary name is not
   * installed on all OS (e.g. Monaco is macOS-first; Windows needs Consolas fallback).
   */
  canvasFontFamily?: string
  /**
   * Labels that may still appear in older SVG/JSON (e.g. renames from the SVG editor).
   */
  legacyNames?: string[]
}
