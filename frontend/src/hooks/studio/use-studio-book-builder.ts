import { useEffect, useMemo, useState } from 'react'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { useStudioGenerate } from '@/hooks/studio/use-studio-generate'
import { useStudioTarget } from '@/context/StudioTargetContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { randomStudioSeed } from '@/constants/studio.constants'
import {
  formatStudioBulkTitleRange,
  nextStudioGameTitle,
  resolveStudioGeneratePlacement,
} from '@/utils/studio/studio-instance-pages'
import { STUDIO_BULK_MAX_BOOK_PAGES } from '@/utils/studio/studio-bulk-allocate'
import { clampStudioBulkQuantity, splitStudioConfigFields } from '@/utils/studio/studio-bulk'
import {
  STUDIO_BOOK_DEFAULT_GAME_COUNT,
  STUDIO_BOOK_MAX_GAMES,
  buildChosenBookPlan,
  buildRandomBookPlan,
  countBookRowsTotal,
  estimateBookPlanPages,
  getEligibleBookTemplates,
} from '@/utils/studio/studio-book-plan'
import { clampStudioConfigToSchema } from '@/utils/studio/studio-config-fields'
import {
  withStudioPageHeader,
  type StudioPageHeader,
} from '@/utils/studio/studio-page-header'
import { resolveStudioMarginForPage } from '@/utils/studio/studio-margin'
import type {
  StudioBookGameRow,
  StudioBookMode,
  StudioBookOrder,
  StudioCategory,
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'

function clampGameCount(value: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 1
  return Math.min(STUDIO_BOOK_MAX_GAMES, Math.max(1, n))
}

function createRowId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `book-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function firstTemplateKey(): string {
  const eligible = getEligibleBookTemplates({ categories: [] })
  return (eligible[0] ?? STUDIO_TEMPLATES[0]!).key
}

function createRow(templateKey: string): StudioBookGameRow {
  const def = getStudioTemplate(templateKey) ?? STUDIO_TEMPLATES[0]!
  return { id: createRowId(), templateKey: def.key, quantity: 1, config: buildDefaultConfig(def) }
}

export function useStudioBookBuilder() {
  const { canvasStateStore, interiorPageCount } = useStudioTarget()
  const { pageDimensions, marginGuide } = useCanvasSettings()
  const { generateBook, cancel, isGenerating, progress, error } =
    useStudioGenerate(canvasStateStore)

  const layout = useMemo<StudioConfigLayoutContext>(
    () => ({
      pageWidth: pageDimensions.widthPixels,
      pageHeight: pageDimensions.heightPixels,
      margin: resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: pageDimensions.widthPixels,
        pageHeight: pageDimensions.heightPixels,
        marginGuide,
      }),
    }),
    [pageDimensions.widthPixels, pageDimensions.heightPixels, marginGuide],
  )

  const [mode, setMode] = useState<StudioBookMode>('random')
  const [gameCount, setGameCountState] = useState(STUDIO_BOOK_DEFAULT_GAME_COUNT)
  const [seed, setSeed] = useState(() => randomStudioSeed())
  const [categories, setCategories] = useState<StudioCategory[]>([])
  const [rows, setRows] = useState<StudioBookGameRow[]>(() => [createRow(firstTemplateKey())])
  const [order, setOrder] = useState<StudioBookOrder>('sequential')
  // On by default — whole-book runs number pages as "Game N" so KDP interiors
  // stay labeled. Sellers can turn it off if a title would shrink puzzle count.
  const [showTitle, setShowTitle] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  const plan = useMemo(() => {
    if (mode === 'random') {
      return buildRandomBookPlan({ gameCount, seed, categories })
    }
    return buildChosenBookPlan({ rows, order, seed })
  }, [mode, gameCount, seed, categories, rows, order])

  const gameTotal = plan.length
  const estimatedPages = useMemo(() => estimateBookPlanPages(plan), [plan])
  const overBudget = interiorPageCount + estimatedPages > STUDIO_BULK_MAX_BOOK_PAGES
  const chosenTotal = mode === 'choose' ? countBookRowsTotal(rows) : gameTotal

  const titlePreview = useMemo(() => {
    if (!showTitle || gameTotal < 1) return null
    return formatStudioBulkTitleRange(
      nextStudioGameTitle(canvasStateStore, interiorPageCount),
      gameTotal,
    )
  }, [showTitle, gameTotal, canvasStateStore, interiorPageCount])

  // Block a run on an invalid game config. Variant-field messages belong in the
  // Customize dialog — only point the seller there from the main list.
  const rowConfigError = useMemo(() => {
    if (mode !== 'choose') return null
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const def = getStudioTemplate(row.templateKey)
      const err = def?.validateConfig?.(row.config) ?? null
      if (!err) continue
      const variantKeys = new Set(
        splitStudioConfigFields(def?.configSchema ?? []).variantFields.map((f) => f.key),
      )
      if (err.field && variantKeys.has(err.field)) {
        return `Game ${i + 1}: open Customize to finish setup.`
      }
      return `Game ${i + 1}: ${err.message}`
    }
    return null
  }, [mode, rows])

  const validationError = (() => {
    if (gameTotal < 1) return 'Add at least one game.'
    if (rowConfigError) return rowConfigError
    if (chosenTotal > STUDIO_BOOK_MAX_GAMES) return `At most ${STUDIO_BOOK_MAX_GAMES} games per book.`
    if (overBudget) {
      return `This book needs too many pages (max ${STUDIO_BULK_MAX_BOOK_PAGES}). Reduce games.`
    }
    return null
  })()

  const setGameCount = (value: number) => setGameCountState(clampGameCount(value))
  const randomizeSeed = () => setSeed(randomStudioSeed())

  /**
   * Every game is generated with this header, whatever its own config says, so
   * layout-aware bounds must be measured with it — "Number pages Game N" costs
   * a title line, and a max resolved without one reads an item too high.
   */
  const pageHeader = useMemo<StudioPageHeader>(() => ({ showTitle }), [showTitle])

  const clampRowConfig = (
    schema: readonly StudioConfigField[],
    config: StudioConfig,
  ): StudioConfig =>
    clampStudioConfigToSchema(
      schema,
      config,
      layout,
      withStudioPageHeader(config, pageHeader),
    )

  /** A schema default can exceed what this trim + header fits — re-fit on the way in. */
  const withFittedConfig = (row: StudioBookGameRow): StudioBookGameRow => {
    const def = getStudioTemplate(row.templateKey)
    if (!def) return row
    const config = clampRowConfig(def.configSchema, row.config)
    return config === row.config ? row : { ...row, config }
  }

  // Trim size, margins, or the "Game N" toggle changed — re-fit every game.
  useEffect(() => {
    setRows((prev) => {
      let changed = false
      const next = prev.map((row) => {
        const fitted = withFittedConfig(row)
        if (fitted === row) return row
        changed = true
        return fitted
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, pageHeader])

  const toggleCategory = (category: StudioCategory) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  const addRow = () => {
    if (rows.length >= STUDIO_BOOK_MAX_GAMES) return
    setRows((prev) => [...prev, withFittedConfig(createRow(firstTemplateKey()))])
  }

  const removeRow = (id: string) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const setRowTemplate = (id: string, templateKey: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const def = getStudioTemplate(templateKey)
        if (!def) return row
        return withFittedConfig({ ...row, templateKey, config: buildDefaultConfig(def) })
      }),
    )
  }

  const setRowQuantity = (id: string, quantity: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, quantity: clampStudioBulkQuantity(quantity) } : row,
      ),
    )
  }

  const setRowConfig = (id: string, config: StudioConfig) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const def = getStudioTemplate(row.templateKey)
        if (!def) return row
        return { ...row, config: clampRowConfig(def.configSchema, config) }
      }),
    )
  }

  const handleGenerate = async () => {
    if (validationError) return
    setNote(null)
    const { startPageIndex, mode: placement } = resolveStudioGeneratePlacement({
      store: canvasStateStore,
      interiorPageCount,
    })
    const titleStart = showTitle
      ? nextStudioGameTitle(canvasStateStore, interiorPageCount)
      : undefined
    const result = await generateBook({
      plan,
      startPageIndex,
      mode: placement,
      interiorPageCount,
      showTitle,
      titleStart,
    })
    if (!result) return
    const skipped = result.instancesSkipped ?? 0
    const duplicated = result.instancesDuplicated ?? 0
    const parts = [`Added ${result.instancesCompleted ?? 0} games to your book.`]
    if (skipped > 0) parts.push(`${skipped} skipped (content failed).`)
    // Never let a repeat reach print unannounced — the seller has to know
    // which pages to redraw before the file goes to KDP.
    if (duplicated > 0) {
      parts.push(
        `${duplicated} repeat content already in this book — regenerate them before publishing.`,
      )
    }
    setNote(parts.join(' '))
    if (mode === 'random') randomizeSeed()
  }

  const generateLabel = isGenerating
    ? 'Building…'
    : `Build book · ${gameTotal} game${gameTotal === 1 ? '' : 's'}`

  return {
    state: {
      mode,
      gameCount,
      categories,
      rows,
      order,
      showTitle,
      layout,
      pageHeader,
      gameTotal,
      estimatedPages,
      titlePreview,
      validationError,
      generateLabel,
      note,
      error,
      isGenerating,
      progress,
      isGenerateDisabled: isGenerating || Boolean(validationError),
    },
    actions: {
      setMode,
      setGameCount,
      toggleCategory,
      setShowTitle,
      setOrder,
      addRow,
      removeRow,
      setRowTemplate,
      setRowQuantity,
      setRowConfig,
      handleGenerate,
      cancel,
    },
  }
}
