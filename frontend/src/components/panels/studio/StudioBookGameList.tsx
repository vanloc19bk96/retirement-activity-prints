import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Settings2, Trash2 } from 'lucide-react'
import { STUDIO_TEMPLATES, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_CATEGORIES } from '@/constants/studio-categories'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { StudioConfigField } from './StudioConfigField'
import { STUDIO_FIELD_INPUT_CLASS } from './fields/field-input-classes'
import { FieldShell } from './fields/FieldShell'
import {
  STUDIO_BULK_QUANTITY_MAX,
  STUDIO_BULK_QUANTITY_MIN,
  clampStudioBulkQuantity,
  splitStudioConfigFields,
} from '@/utils/studio/studio-bulk'
import { STUDIO_BOOK_MAX_GAMES } from '@/utils/studio/studio-book-plan'
import {
  clampStudioConfigToSchema,
  resolveStudioConfigField,
} from '@/utils/studio/studio-config-fields'
import {
  withStudioPageHeader,
  type StudioPageHeader,
} from '@/utils/studio/studio-page-header'
import type {
  StudioBookGameRow,
  StudioBookOrder,
  StudioConfigField as FieldDef,
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'

interface Props {
  rows: StudioBookGameRow[]
  order: StudioBookOrder
  layout: StudioConfigLayoutContext
  /** Header every game in the book is generated with — bounds measure it out. */
  pageHeader: StudioPageHeader
  onOrderChange: (order: StudioBookOrder) => void
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onTemplateChange: (id: string, templateKey: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onConfigChange: (id: string, config: StudioConfig) => void
}

const ORDER_OPTIONS: { value: StudioBookOrder; label: string }[] = [
  { value: 'sequential', label: 'In order' },
  { value: 'shuffle', label: 'Shuffle' },
]

/**
 * Book builder always uses the AI / preset-theme path for word games.
 * Custom word lists stay on the single-game form — hide the switchers here.
 */
const BOOK_CUSTOMIZE_HIDDEN_KEYS = new Set(['source', 'words'])

/** Keep config on the schema default word source (AI / theme), never custom. */
function withBookDefaultWordSource(
  schema: FieldDef[],
  config: StudioConfig,
): StudioConfig {
  const sourceField = schema.find((field) => field.key === 'source')
  if (!sourceField) return config
  return { ...config, source: sourceField.default }
}

/** Fields the user can tune for a template (visibility-aware). */
function visibleVariantFields(templateKey: string, config: StudioConfig): FieldDef[] {
  const def = getStudioTemplate(templateKey)
  if (!def) return []
  return splitStudioConfigFields(def.configSchema).variantFields.filter(
    (field) =>
      !BOOK_CUSTOMIZE_HIDDEN_KEYS.has(field.key) &&
      (!field.visibleWhen || field.visibleWhen(config)),
  )
}

/** Template <select> options grouped by category, in tab order. */
function useGroupedTemplateOptions() {
  return useMemo(
    () =>
      STUDIO_CATEGORIES.filter((c) => c.value !== 'all').map((c) => ({
        label: c.label,
        templates: STUDIO_TEMPLATES.filter((t) => t.category === c.value),
      })),
    [],
  )
}

export function StudioBookGameList({
  rows,
  order,
  layout,
  pageHeader,
  onOrderChange,
  onAddRow,
  onRemoveRow,
  onTemplateChange,
  onQuantityChange,
  onConfigChange,
}: Props) {
  const groups = useGroupedTemplateOptions()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(rows[0] ? [rows[0].id] : []),
  )
  const [customizeRowId, setCustomizeRowId] = useState<string | null>(null)
  /** Draft while the dialog is open — committed only on Done. */
  const [draftConfig, setDraftConfig] = useState<StudioConfig | null>(null)
  const rowIdsRef = useRef(rows.map((row) => row.id))

  // Prune removed ids; adding a game collapses the rest and expands the new one.
  useEffect(() => {
    const ids = rows.map((row) => row.id)
    const previous = rowIdsRef.current
    const added = ids.filter((id) => !previous.includes(id))
    rowIdsRef.current = ids

    setExpandedIds((prev) => {
      const valid = new Set(ids)
      if (added.length > 0) return new Set(added)
      return new Set([...prev].filter((id) => valid.has(id)))
    })
  }, [rows])

  // Drop the dialog if its row was removed.
  useEffect(() => {
    if (!customizeRowId) return
    if (rows.some((row) => row.id === customizeRowId)) return
    setCustomizeRowId(null)
    setDraftConfig(null)
  }, [rows, customizeRowId])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(rows.map((row) => row.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const openCustomize = (row: StudioBookGameRow) => {
    const def = getStudioTemplate(row.templateKey)
    const draft = def
      ? withBookDefaultWordSource(def.configSchema, { ...row.config })
      : { ...row.config }
    setDraftConfig(draft)
    setCustomizeRowId(row.id)
  }

  const discardCustomize = () => {
    setCustomizeRowId(null)
    setDraftConfig(null)
  }

  const customizeRow = customizeRowId
    ? rows.find((row) => row.id === customizeRowId) ?? null
    : null
  const customizeDef = customizeRow ? getStudioTemplate(customizeRow.templateKey) : null
  const activeDraft = customizeRow && draftConfig ? draftConfig : null
  const customizeFields = customizeRow && activeDraft
    ? visibleVariantFields(customizeRow.templateKey, activeDraft)
    : []
  const customizeConfigError =
    activeDraft && customizeDef
      ? (customizeDef.validateConfig?.(activeDraft) ?? null)
      : null
  const isCustomizeDoneDisabled = Boolean(customizeConfigError)
  // A rule can fail on a field this dialog does not render (a shared field, or a
  // variant hidden by visibleWhen). Without this fallback the message vanishes
  // and Done just disables with no reason — the single form never hides it.
  const customizeFieldKeys = new Set(customizeFields.map((field) => field.key))
  const customizeOrphanError =
    customizeConfigError &&
    (!customizeConfigError.field || !customizeFieldKeys.has(customizeConfigError.field))
      ? customizeConfigError.message
      : null

  const setDraftField = (key: string, value: unknown) => {
    if (!customizeDef || !activeDraft) return
    const next = { ...activeDraft, [key]: value }
    setDraftConfig(
      clampStudioConfigToSchema(
        customizeDef.configSchema,
        next,
        layout,
        withStudioPageHeader(next, pageHeader),
      ),
    )
  }

  const handleCustomizeDone = () => {
    if (!customizeRow || !activeDraft || !customizeDef || isCustomizeDoneDisabled) return
    onConfigChange(
      customizeRow.id,
      withBookDefaultWordSource(customizeDef.configSchema, activeDraft),
    )
    discardCustomize()
  }

  return (
    <div className="space-y-3">
      <FieldShell label="Order" help="Keep the listed order or shuffle games across the book.">
        <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="Game order">
          {ORDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={order === option.value}
              onClick={() => onOrderChange(option.value)}
              className={cn(
                'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                order === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FieldShell>

      {rows.length > 1 ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={expandAll}
            aria-label="Expand all games"
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={collapseAll}
            aria-label="Collapse all games"
          >
            Collapse all
          </Button>
        </div>
      ) : null}

      {rows.map((row, index) => {
        const def = getStudioTemplate(row.templateKey)
        const isExpanded = expandedIds.has(row.id)
        const panelId = `book-row-panel-${row.id}`
        const quantity = clampStudioBulkQuantity(row.quantity)
        const summary = `${def?.label ?? row.templateKey} · ×${quantity}`
        const canCustomize = visibleVariantFields(row.templateKey, row.config).length > 0

        return (
          <section
            key={row.id}
            className="rounded-md border border-border"
            aria-label={`Game ${index + 1}`}
          >
            <div className="flex items-center gap-1 p-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted/60"
                onClick={() => toggleExpanded(row.id)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                    isExpanded ? 'rotate-0' : '-rotate-90',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  <span className="text-xs font-semibold text-foreground">Game {index + 1}</span>
                  {!isExpanded ? (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{summary}</span>
                  ) : null}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onRemoveRow(row.id)}
                disabled={rows.length <= 1}
                aria-label={`Remove game ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>

            {isExpanded ? (
              <div id={panelId} className="space-y-3 border-t border-border px-2.5 pb-2.5 pt-3">
                <select
                  value={row.templateKey}
                  onChange={(e) => onTemplateChange(row.id, e.target.value)}
                  aria-label={`Game ${index + 1} type`}
                  className={cn(STUDIO_FIELD_INPUT_CLASS, 'w-full')}
                >
                  {groups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`book-row-qty-${row.id}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Qty
                  </label>
                  <input
                    id={`book-row-qty-${row.id}`}
                    type="number"
                    min={STUDIO_BULK_QUANTITY_MIN}
                    max={STUDIO_BULK_QUANTITY_MAX}
                    step={1}
                    value={quantity}
                    onChange={(e) => onQuantityChange(row.id, Number(e.target.value) || 1)}
                    className={cn(STUDIO_FIELD_INPUT_CLASS, 'w-20')}
                  />
                  {canCustomize ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto h-8"
                      onClick={() => openCustomize(row)}
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Customize
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onAddRow}
        disabled={rows.length >= STUDIO_BOOK_MAX_GAMES}
        aria-label="Add game"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Add game
      </Button>

      <Dialog
        open={customizeRowId !== null}
        onOpenChange={(open) => {
          if (!open) discardCustomize()
        }}
      >
        <DialogContent className="flex flex-col gap-5 bg-white p-6 sm:max-w-md dark:bg-slate-900">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="pr-8 text-base">
              Customize {customizeDef?.label ?? 'game'}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              These settings apply to every copy of this game in the book.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-0.5">
            {customizeRow && activeDraft && customizeFields.length > 0 ? (
              customizeFields.map((field) => (
                <StudioConfigField
                  key={field.key}
                  field={resolveStudioConfigField(
                    field,
                    withStudioPageHeader(activeDraft, pageHeader),
                    layout,
                  )}
                  value={activeDraft[field.key]}
                  onChange={(value) => setDraftField(field.key, value)}
                  error={
                    customizeConfigError?.field === field.key
                      ? customizeConfigError.message
                      : null
                  }
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                This game has no extra settings — it uses smart defaults.
              </p>
            )}
            {customizeOrphanError ? (
              <p className="text-sm text-destructive" role="alert">
                {customizeOrphanError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              onClick={handleCustomizeDone}
              disabled={isCustomizeDoneDisabled}
              className="min-w-24"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
