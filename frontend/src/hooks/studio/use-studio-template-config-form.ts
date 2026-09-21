import { useEffect, useMemo, useState } from 'react'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { useStudioGenerate } from '@/hooks/studio/use-studio-generate'
import { useStudioTarget } from '@/context/StudioTargetContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import {
  bumpStudioGameTitle,
  nextStudioGameTitle,
  resolveStudioGeneratePlacement,
} from '@/utils/studio/studio-instance-pages'
import { clampStudioConfigToSchema, resolveStudioConfigField } from '@/utils/studio/studio-config-fields'
import { resolveStudioMarginForPage } from '@/utils/studio/studio-margin'
import {
  withStudioPageHeader,
  type StudioPageHeader,
} from '@/utils/studio/studio-page-header'
import type {
  StudioCategory,
  StudioConfig,
  StudioConfigLayoutContext,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'

/**
 * First-phase copy while the AI writes the content. Worded per category so a
 * crossword never claims to be “writing your story”.
 */
const CONTENT_PHASE_LABEL: Record<StudioCategory, string> = {
  logic: 'Working out the puzzle…',
  word: 'Picking the words…',
  spatial: 'Sketching the puzzle…',
  reminiscence: 'Writing your prompts…',
}

export function useStudioTemplateConfigForm(template: StudioTemplateDefinition) {
  const { canvasStateStore, interiorPageCount } = useStudioTarget()
  const { pageDimensions, marginGuide } = useCanvasSettings()
  const { generate, cancel, isGenerating, progress, error } =
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

  const fixedPageTitle = template.defaultPageTitle?.trim() || null
  const [config, setConfig] = useState<StudioConfig>(() => {
    const defaults = buildDefaultConfig(template)
    if (defaults.showTitle !== true) return defaults
    return {
      ...defaults,
      title:
        fixedPageTitle ?? nextStudioGameTitle(canvasStateStore, interiorPageCount),
    }
  })
  const [isTitleCustomized, setIsTitleCustomized] = useState(false)

  const showTitle = config.showTitle === true

  /** Header this run stamps on every sheet — layout-aware bounds measure it out. */
  const pageHeader = useMemo<StudioPageHeader>(
    () => ({
      showTitle,
      title: config.title,
      showInstructions: config.showInstructions,
    }),
    [showTitle, config.title, config.showInstructions],
  )

  // A blank heading still prints "Game N", so bounds must be measured with one.
  const boundsConfig = useMemo(
    () => withStudioPageHeader(config, pageHeader),
    [config, pageHeader],
  )

  const clampConfig = (next: StudioConfig): StudioConfig =>
    clampStudioConfigToSchema(
      template.configSchema,
      next,
      layout,
      withStudioPageHeader(next, {
        showTitle: next.showTitle === true,
        title: next.title,
        showInstructions: next.showInstructions,
      }),
    )

  const visibleFields = useMemo(
    () =>
      template.configSchema
        .filter((f) => !f.visibleWhen || f.visibleWhen(config))
        .map((f) => resolveStudioConfigField(f, boundsConfig, layout)),
    [template.configSchema, config, boundsConfig, layout],
  )

  const configError = useMemo(
    () => template.validateConfig?.(config) ?? null,
    [template, config],
  )

  // Keep number fields inside layout-aware max when trim size, margins, or the
  // page header (title / instructions) change — each shrinks the printable body.
  useEffect(() => {
    setConfig(clampConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, template.configSchema, pageHeader])

  const setField = (key: string, value: unknown) => {
    if (key === 'title') setIsTitleCustomized(true)
    if (key === 'showTitle') {
      const enabled = value === true
      if (!enabled) {
        setIsTitleCustomized(false)
        setConfig((c) => clampConfig({ ...c, showTitle: false, title: '' }))
        return
      }
      const autoTitle =
        fixedPageTitle ?? nextStudioGameTitle(canvasStateStore, interiorPageCount)
      setIsTitleCustomized(false)
      setConfig((c) => clampConfig({ ...c, showTitle: true, title: autoTitle }))
      return
    }
    setConfig((c) => clampConfig({ ...c, [key]: value }))
  }

  const resolveTitleForGenerate = (): string => {
    if (!showTitle) return ''
    // Fixed-title templates keep their default until the user edits.
    if (fixedPageTitle && !isTitleCustomized) return fixedPageTitle
    if (!isTitleCustomized) {
      return nextStudioGameTitle(canvasStateStore, interiorPageCount)
    }
    // Cleared heading falls back to the auto series, as the field help promises.
    const typed = String(config.title ?? '').trim()
    if (typed) return typed
    return fixedPageTitle ?? nextStudioGameTitle(canvasStateStore, interiorPageCount)
  }

  const handleGenerate = async () => {
    if (template.validateConfig?.(config)) return
    const { startPageIndex, mode } = resolveStudioGeneratePlacement({
      store: canvasStateStore,
      interiorPageCount,
    })
    const title = resolveTitleForGenerate()
    const result = await generate({
      templateKey: template.key,
      config: { ...config, title, showTitle },
      startPageIndex,
      mode,
      interiorPageCount,
    })
    if (!result || isTitleCustomized || !showTitle) return
    // Fixed defaults stay put; Game N advances for the next puzzle sheet.
    if (fixedPageTitle) return
    setConfig((c) => ({
      ...c,
      title:
        bumpStudioGameTitle(title) ??
        nextStudioGameTitle(canvasStateStore, interiorPageCount + result.pageIndices.length),
    }))
  }

  const progressLabel = (() => {
    if (progress?.countKind === 'instance') {
      const current = Math.min(progress.completed + 1, progress.total)
      return `Making game ${current} of ${progress.total}…`
    }
    // Prefetch templates run two phases: write the content, then lay it out.
    if (template.prefetch && (!progress || progress.completed === 0)) {
      return CONTENT_PHASE_LABEL[template.category]
    }
    return template.pageCount === 2 ? 'Laying out the pages…' : 'Laying out the page…'
  })()

  return {
    state: {
      config,
      visibleFields,
      configError,
      error,
      isGenerating,
      progress,
      progressLabel,
      generateLabel: 'Add to book',
      isGenerateDisabled: isGenerating || Boolean(configError),
    },
    actions: {
      setField,
      handleGenerate,
      cancel,
    },
  }
}
