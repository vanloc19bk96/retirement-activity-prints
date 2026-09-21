# Retirement Activity Prints — Editor Architecture Spec

> **Purpose:** This document describes the **Retirement Activity Prints** multi-page book/canvas editor infrastructure.
>
> **Scope:** Editor shell, Fabric.js canvas, save/export, auth, persistence, and backend services.  
> **Out of scope:** WarriorPlus billing.

---

## 1. Project Overview

### 1.1 What this app is

A **multi-page book editor** (Retirement Activity Prints) for creating print-ready interiors and book covers:

- Interior pages: up to **1000** Fabric.js canvases with lazy mount
- Book cover mode: single always-mounted canvas with KDP-style zone guides
- Persistence: Fabric JSON per page in Supabase
- Export: PNG, JPG, SVG, PDF, PPT (client-side, chunked for scale)
- Auth: launched from an external **Creator Hub** via launch token (no local login)

### 1.2 Monorepo layout

```
book-canvas-editor/
├── frontend/                 # Vite + React 18 + TypeScript SPA
│   └── src/
│       ├── api/              # Raw fetch wrappers (no business logic)
│       ├── components/       # UI + layout + panels
│       ├── context/          # React contexts (domain state)
│       ├── hooks/            # Business logic hooks
│       ├── services/         # Auth service (axios client wrapper)
│       ├── types/            # Request/response + UI interfaces
│       ├── utils/            # Pure helpers (no React imports)
│       └── constants/        # Static config
├── backend/                  # FastAPI + Supabase + Redis/RQ
│   └── app/
│       ├── api/routes/       # Thin HTTP handlers
│       ├── services/         # All business logic lives here
│       ├── schemas/          # Pydantic models
│       └── core/             # Config, dependencies, Supabase client
├── docker-compose.yml        # Redis, backend, 3 workers
└── Dockerfile                # Python 3.11 image
```

### 1.3 Runtime topology

| Service | Role | Port / network |
|---------|------|----------------|
| Frontend (Vite dev) | React SPA | Default Vite port; proxies `/api` → `localhost:8011` |
| Backend (FastAPI) | REST API | Host `8011` → container `8000` (not 8010 — reserved by logic-grid-prints) |
| Redis | Job queue | `retirement-activity-prints-redis` on `appnet` |
| Workers | RQ async jobs | AI image jobs |
| Supabase | Postgres + Storage | External network `supabase_default` |

Schema namespace in Supabase: `retirement_activity_prints`.

---

## 2. Technology Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React 18, TypeScript, Vite 7, React Router 7, Tailwind 4, Radix/shadcn UI |
| Canvas | Fabric.js 7 |
| Export | jsPDF, pdf-lib, pptxgenjs, svg2pdf.js, client-zip, streamsaver |
| HTTP (frontend) | `fetch` in `api/*.api.ts`; axios in `lib/launchAuthClient.ts` |
| Backend | FastAPI, Pydantic v2, Uvicorn |
| Database / storage | Supabase (Postgres + object storage) |
| Queue | Redis + RQ |
| Auth | Creator Hub launch tokens |

---

## 3. Frontend Architecture

### 3.1 Routing

```text
/                  → MainLayout (protected)
/open-from-hub     → OpenFromHubPage (public — hub token handoff)
*                  → redirect to /
```

- `AuthProvider` wraps the app in `App.tsx`
- `ProtectedRoute` reads `AuthContext`; unauthenticated users go to `/open-from-hub`

### 3.2 Context provider hierarchy

`MainLayout.tsx` nests providers (outer → inner):

```text
BookProvider
  EditorModeProvider              # interior vs book-cover
    CanvasSettingsProvider        # page size, bleed, margins, book info
      CanvasExportProvider        # export source factory registration
        PageThumbnailsProvider
          CanvasSaveProvider      # save orchestration + unsaved state
            CanvasPenToolProvider # pen / pencil / erase
              Header + Sidebar + PageThumbnails + MainContent
```

Additional contexts scoped inside `MainContent`:

| Context | File | Responsibility |
|---------|------|----------------|
| `AuthContext` | `context/AuthContext.tsx` | Hub token, user, refresh |
| `BookContext` | `context/BookContext.tsx` | `bookId` (minimal) |
| `EditorModeContext` | `context/EditorModeContext.tsx` | `isInteriorMode` / `isBookCoverMode` |
| `CanvasSettingsContext` | `context/CanvasSettingsContext.tsx` | Page dimensions, bleed, KDP book info |
| `CanvasSaveContext` | `context/CanvasSaveContext.tsx` | Save registration, unsaved warnings |
| `CanvasExportContext` | `context/CanvasExportContext.tsx` | Export factory injection |
| `PageThumbnailsContext` | `context/PageThumbnailsContext.tsx` | Thumbnail strip state |
| `CanvasPenToolContext` | `context/CanvasPenToolContext.tsx` | Drawing tool mode |
| `EditorZoomContext` | `context/EditorZoomContext.tsx` | Zoom ref + value |
| `EditorScrollContext` | `context/EditorScrollContext.tsx` | Scroll container ref for IntersectionObserver |

### 3.3 Component hierarchy

```text
MainLayout
├── Header.tsx                         # theme toggle, user menu, upgrade CTAs
├── Sidebar.tsx                        # panel navigation
│   ├── ComponentsPanel                # image / text / shape / icon / emoji
│   ├── PhotosPanel, ToolsPanel, SettingPanel
│   ├── DownloadPanel, SavePanel, AlignmentPanel, BookInfoPanel
├── PageThumbnails.tsx                 # left strip
└── MainContent.tsx                    # orchestrator (wires hooks + canvases)
    ├── Toolbar.tsx                    # selection formatting
    ├── PageRow.tsx × N                # one row per interior page
    │   └── CanvasPageItem             # lightweight shell
    │       └── FabricCanvasItemActive # heavy Fabric hooks when visible
    ├── CanvasPageItem (cover)         # always mounted
    ├── DeletePageDialogHost, ResetInteriorDialog
    └── MainFooter.tsx                 # mode toggle, zoom
```

**Key pattern:** `MainContent` is the **container/orchestrator**. Hooks own business logic. Leaf components receive **data + callbacks only** — they do not call Fabric APIs directly.

### 3.4 Four-layer frontend pattern

Every feature that touches the backend follows:

```text
types/*.types.ts  →  api/*.api.ts  →  hooks/use-*.ts  →  components/
```

| Layer | Rules |
|-------|-------|
| `types/` | Request/response interfaces, UI state types. No React imports. |
| `api/` | Raw `fetch` calls. Auth headers only. No business logic. |
| `hooks/` | Loading/error state, orchestration, stable `{ state, actions }` or `{ toolbar, pageRow }` bindings. |
| `components/` | UI only. Props typed from `types/`. Max 3–4 top-level props on leaf components. |

### 3.5 API modules (editor-relevant)

| Module | Endpoint prefix | Purpose |
|--------|-----------------|---------|
| `canvases.api.ts` | `/api/canvases` | Batch save/load Fabric JSON |
| `projects.api.ts` | `/api/projects` | Project settings, page-size options |
| `storage.api.ts` | `/api/storage` | Image upload to Supabase Storage |
| `downloads.api.ts` | `/api/downloads` | Download quota, PDF merge sessions |
| `ai-images.api.ts` | `/api/ai-images` | AI interior images (async jobs) |
| `cover.api.ts` | `/api/cover` | AI cover generation |
| `outlines.api.ts` | `/api/outlines` | Decorative outline library |
| `emojis.api.ts` | `/api/emojis` | Emoji library |
| `trace-image.api.ts` | — | Image tracing |

**Auth headers** (repeated in each `*.api.ts`):

- `Authorization: Bearer <launch_token>` from `localStorage`
- `X-User-Id` from stored user object

Shared axios client: `lib/launchAuthClient.ts` → wrapped by `services/auth.service.ts`.

### 3.6 Key hooks (editor)

| Domain | Files |
|--------|-------|
| Canvas editor core | `hooks/canvas-editor/use-canvas-editor.ts` |
| Toolbar bindings | `use-canvas-editor-toolbar-bindings.ts` |
| Page row bindings | `use-canvas-editor-page-row-bindings.ts` |
| Fabric lifecycle | `use-fabric-canvas-lifecycle.ts` |
| Visibility (lazy mount) | `use-fabric-canvas-visibility.ts` |
| Zoom sync | `use-fabric-canvas-zoom-sync.ts` |
| Pen/erase tools | `use-fabric-canvas-pen-tools.ts` |
| Drop handlers | `use-fabric-canvas-drop-handlers.ts` |
| Selection toolbar | `use-fabric-canvas-selection-toolbar-state.ts`, `...-actions.ts` |
| Save | `use-canvas-saves.ts` + `CanvasSaveContext` |
| Download | `use-canvas-download.ts`, `use-download-quota.ts`, `use-download-page-selection.ts` |
| Project settings | `use-project-settings.ts`, `use-project-settings-sync.ts` |
| Book info form | `use-book-info-form.ts` |

`useCanvasEditor` returns `CanvasEditorBindings` (`canvas-editor-types.ts`): `{ toolbar, pageRow }` — stable shapes wired into `Toolbar` and `PageRow`.

### 3.7 Sidebar panels

`PanelKey` in `components/layout/layout.types.ts`:

```typescript
type PanelKey =
  | 'components'  // image, text, shape, icon, emoji
  | 'photos'
  | 'tools'       // pen, pencil, erase
  | 'setting'     // page size, bleed, visual guides
  | 'download'
  | 'save'
  | 'alignment'
  | 'bookInfo'
```

`ComponentElementKey`: `'image' | 'text' | 'shape' | 'icon' | 'emoji'`

---

## 4. Fabric.js Canvas Editor

### 4.1 Lazy mount + visibility hysteresis

Two-component split per page:

| Component | Responsibility |
|-----------|----------------|
| `FabricCanvasItem` | Shell: layout, visibility detection, zoom dimension sync, loading overlay |
| `FabricCanvasItemActive` | Heavy hooks: Fabric init, handlers, pen tools, selection — only when `isActive` |

`use-fabric-canvas-visibility.ts` uses dual `IntersectionObserver` with different `rootMargin`:

```typescript
const VERTICAL_ACTIVATION_MARGIN_PX = 2000    // pre-warm ~2 page rows before viewport
const VERTICAL_DEACTIVATION_MARGIN_PX = 8000    // dispose only when far off-screen
```

Rules:

- **Book cover** canvas is always active (`isBookCover` bypasses lazy mount)
- Off-screen pages with persisted JSON show `CanvasLoadingOverlay` until activated
- On deactivate: dispose Fabric canvas, detach listeners, release memory
- `MAX_EDITOR_INTERIOR_PAGES = 1000`

### 4.2 Canvas state store

`utils/canvas-state-store.ts` — in-memory `CanvasStateStore` per editor session:

| Method / concept | Purpose |
|------------------|---------|
| `has(pageIndex)` | Whether serialized JSON exists for a page |
| `get(pageIndex)` | Read stored Fabric JSON |
| `set(pageIndex, json)` | Write serialized JSON |
| `markFabricLiveTrusted` / `markFabricLiveUntrusted` | Trust live canvas instance vs store |
| `exportLiveFabricCanvasJson(canvas)` | Export from live Fabric instance |
| `prepareCanvasJsonForPersistence(json)` | Normalize before save (e.g. eraser → original image URL) |
| `CUSTOM_OBJECT_PROPS` | Extra Fabric object fields persisted on save |

**Editor-relevant custom props:**

```typescript
// Shared editor props in CUSTOM_OBJECT_PROPS:
'originalImageUrl', 'lockMovementX', 'lockMovementY', 'lockScalingX',
'lockScalingY', 'lockRotation', 'hasControls', 'selectable', 'editable',
'objectId', 'eraserStrokes', 'eraserSourceCrop', 'isEraserPath',
'linkedImageId', 'eraserBrushWidth'
```

`MainContent` owns one `CanvasStateStore` instance and passes it to each `FabricCanvasItem`.

### 4.3 Fabric lifecycle (`use-fabric-canvas-lifecycle.ts`)

On active mount:

1. Create `Canvas` with retina scaling and background
2. Restore from `canvasStateStore` or start empty
3. Attach interaction handlers (`fabric-canvas-interaction-handlers.ts`)
4. Attach text handlers, eraser bake, history manager
5. Wire selection → toolbar / context menu

On deactivate: dispose canvas, detach listeners.

### 4.4 Editor features (shared)

| Feature | Key files |
|---------|-----------|
| Undo/redo | `utils/fabric-canvas-history.ts` |
| Selection + lock | `utils/fabric-selection.ts`, `utils/canvas-lock.ts` |
| Alignment | `utils/canvas-align.ts`, `hooks/canvas-editor/canvas-editor-actions.ts` |
| Text editing | `utils/canvas-text.ts`, `utils/fabric-canvas-text-event-handlers.ts` |
| Pen/pencil/erase | `utils/fabric-pen-tool.ts`, `utils/fabric-eraser-tool.ts`, `utils/fabric-eraser-bake.ts` |
| Image drop/upload | `utils/canvas-image.ts`, `utils/image-dnd.ts` |
| Icons/emojis | `utils/lucide-fabric.ts`, `utils/icon-dnd.ts`, `utils/emoji-dnd.ts` |
| Book cover zones | `utils/book-cover-image-placement.ts`, `components/layout/BookCoverGuideOverlay.tsx` |
| Margin guides | `components/layout/MarginGuideOverlay.tsx`, `types/canvas-settings.types.ts` |
| Grid overlay | `components/layout/CanvasGridOverlay.tsx` |
| Floating toolbar | `components/layout/CanvasSelectionFloatingToolbar.tsx` |
| Context menu | `components/layout/CanvasSelectionContextMenu.tsx` |
| Thumbnails | `utils/canvas-thumbnail.ts` (debounced, concurrency-limited) |
| Page CRUD | `utils/editor-page-events.ts` (custom DOM events) |
| Zoom | `EditorZoomContext`, wheel zoom in `MainContent`, `ZoomControl.tsx` |
| Templates | `utils/canvas-template.ts`, `utils/template-events.ts` |
| Fonts | `utils/font-loader.ts`, `public/fonts/` |

### 4.5 Scale patterns (500–1000 pages)

1. **Lazy mount** — shell + heavy child only near viewport
2. **Hysteresis** — different activate/deactivate margins to avoid mount/dispose thrash
3. **Index structures** — `Map`/`Set` for O(1) lookup in hot paths
4. **Chunk + yield** — long sync work calls `yieldToMainThread()` between chunks
5. **Batch updates** — one `setState` per chunk, not per item
6. **Thumbnail concurrency** — `THUMBNAIL_REQUEST_CONCURRENCY = 2`
7. **Memo at list boundary** — `FabricCanvasItem` wrapped in `React.memo`

---

## 5. Registration patterns (avoid prop drilling)

### 5.1 Canvas save

`CanvasSaveContext` uses ref-registered getters from `MainContent`:

```typescript
registerCanvasesPayloadGetter(() => SaveCanvasesRequest)
registerHasUnsavedCheckGetter(() => boolean)
registerAfterSaveCallback(() => void)
```

Flow:

```text
User clicks Save (Sidebar)
  → CanvasSaveContext.saveCanvases()
  → payload getter (registered by MainContent)
  → useCanvasSaves → canvasesApi.saveCanvasesBatch()
  → POST /api/canvases/batch
```

### 5.2 Canvas export

`CanvasExportContext` registers a factory from `MainContent`:

```typescript
registerExportSourceFactory((request) => ExportSource)
```

Used by `use-canvas-download.ts` → `run-canvas-export.ts` for chunked PNG/JPG/SVG/PDF/PPT pipelines.

### 5.3 Custom DOM events

Cross-cutting editor actions decouple panels from `MainContent`:

| Event module | Purpose |
|--------------|---------|
| `utils/editor-page-events.ts` | Add/delete/duplicate/reorder pages |
| `utils/alignment-events.ts` | Alignment panel ↔ active canvas |
| `utils/template-events.ts` | Apply template to canvas |
| `utils/canvas-thumbnail-events.ts` | Invalidate thumbnail on edit |

Panels dispatch events; `useCanvasEditor` / `MainContent` listen and mutate Fabric state.

---

## 6. Data flows

### 6.1 Auth: Hub → Editor

```text
User opens app from Hub (?token=...)
  → AuthContext useEffect
  → auth.service.verifyLaunchTokenFromUrl()
  → POST /api/auth/verify-launch-token
  → launch_auth_service.verify_launch_token_via_hub()
  → Supabase users table lookup/create
  → localStorage: launch_token, user
  → ProtectedRoute allows MainLayout
```

### 6.2 Load project settings

```text
CanvasSettingsProvider mount
  → useProjectSettingsSync()
  → projectsApi.getSettings()  GET /api/projects/settings
  → if 404: projectsApi.saveSettings(defaults)
  → apply to CanvasSettingsContext (page size, bleed, margins, book info)
```

### 6.3 Load canvases

```text
MainContent mount (after auth)
  → canvasesApi.getCanvases()  GET /api/canvases
  → hydrate CanvasStateStore per page_index
  → FabricCanvasItem restores on activate via lifecycle hook
```

### 6.4 Save canvases

```text
User clicks Save
  → CanvasSaveContext.saveCanvases()
  → payload getter: dirty pages + interior_page_count + referenced image URLs
  → POST /api/canvases/batch
  → canvases_service.save_canvases() → Supabase retirement_activity_prints.canvases
  → prune unreferenced storage images
```

### 6.5 User edits canvas

```text
User selects/moves object on FabricCanvasItemActive
  → fabric-canvas-interaction-handlers
  → useCanvasEditor selection state → Toolbar bindings
  → object:modified → history snapshot + thumbnail invalidation event
  → CanvasSaveContext.refreshHasUnsavedChanges() (debounced 150ms)
```

### 6.6 Download / export

```text
DownloadPanel.startDownload()
  → useDownloadQuota.consumeQuota()  POST /api/downloads/consume
  → useCanvasDownload.startDownload()
  → CanvasExportContext.createExportSource(request)
    (live canvas JSON or store fallback)
  → runCanvasExport() → format-specific chunked pipeline
  → browser download (or zip via streamsaver)
```

### 6.7 Image upload

```text
ImagePanel / drop on canvas
  → storage.api upload  POST /api/storage/images
  → storage_service.upload_user_image() → Supabase Storage
  → public URL added to Fabric image object
  → URL tracked in referenced_supabase_image_public_urls on save
```

---

## 7. Backend Architecture

### 7.1 Structure

```text
backend/app/
├── main.py                 # FastAPI app, CORS, router mount at /api
├── core/
│   ├── config.py           # Settings from env
│   ├── dependencies.py     # get_current_launch_user, get_current_user_id
│   └── supabase.py         # Admin client factory
├── api/routes/             # Thin HTTP handlers → call service → return schema
├── schemas/                # Pydantic request/response models
└── services/               # ALL business logic (required)
```

**Rule:** Routes parse HTTP, call one service method, return response. No business logic in routes.

### 7.2 Editor-relevant routes

| Route file | Prefix | Purpose |
|------------|--------|---------|
| `auth.py` | `/auth` | Hub token verify / refresh / me |
| `projects.py` | `/projects` | Settings, page sizes |
| `canvases.py` | `/canvases` | Fabric JSON persistence |
| `storage.py` | `/storage` | Image upload |
| `downloads.py` | `/downloads` | Quota, PDF merge |
| `ai_images.py` | `/ai-images` | AI interior images (async) |
| `cover.py` | `/cover` | AI cover generation |
| `outlines.py` | `/outlines` | Outline library |
| `emojis.py` | `/emojis` | Emoji library |
| `thumbnail_asset.py` | `/thumbnail-asset` | Thumbnail helpers |

### 7.3 Auth dependencies

`core/dependencies.py`:

| Dependency | Behavior |
|------------|----------|
| `get_current_launch_user` | Requires Bearer or `X-Launch-Token`; verifies with Hub; returns `UserResponse` |
| `get_current_user_id` | Prefers `X-User-Id` header; falls back to launch token |

No local register/login. Users are created/resolved in `retirement_activity_prints.users` on first hub launch.

### 7.4 Persistence (Supabase)

| Table / resource | Service | Content |
|------------------|---------|---------|
| `projects` | `projects_service.py` | `settings` JSONB (page size, bleed, book info) |
| `canvases` | `canvases_service.py` | `canvas_data` JSONB per page; `canvas_type` interior/cover |
| `users` | `user_service.py`, `launch_auth_service.py` | plan, download quota |
| Storage bucket | `storage_service.py` | User-uploaded images |

### 7.5 Workers (editor-relevant portion)

`backend/worker.py` processes Redis queues:

- **AI image generation** — `ai_image_queue_service` (editor feature)

---

## 8. Canvas settings & book modes

### 8.1 Interior mode

Managed by `CanvasSettingsContext`:

- Page size label (KDP presets)
- Bleed on/off
- Visual margin guides
- Page count
- Derived: `pageDimensions`, `marginGuide`

Settings sync to backend via `useProjectSettingsSync` → `projectsApi`.

### 8.2 Book cover mode

`EditorModeContext` toggles `isInteriorMode` / `isBookCoverMode`.

Cover-specific:

- `bookCoverDimensions`, `bookCoverZones` from `types/book-cover.types.ts`
- `BookCoverGuideOverlay` — spine, front, back zones
- `book-cover-image-placement.ts` — drop images into correct zone
- Cover canvas always mounted (no lazy dispose)

### 8.3 Book info panel

`ProjectBookInfo` stored in project settings:

- Title, subtitle, author, description
- Used for cover text defaults and export metadata
- Constants: `constants/book-information.constants.ts`
- Form hook: `hooks/use-book-info-form.ts`

---

## 9. Coding conventions

### 9.1 Naming

| Kind | Convention | Example |
|------|------------|---------|
| Variables, functions | camelCase | `activeUsers`, `calculateTotalPrice` |
| Types, interfaces | PascalCase | `UserProfile`, `ApiResponse` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Files | kebab-case | `use-canvas-editor.ts` |
| Booleans | is/has/can prefix | `isLoading`, `hasPermission` |

### 9.2 Size limits

| Unit | Limit |
|------|-------|
| File | 300 lines (split if exceeded) |
| Function | 30–50 lines |
| Parameters | 3–4 max (use options object) |

### 9.3 React state rules

- State at **lowest scope** that needs it
- Never store **derivable** data in state — compute during render
- `useRef` for values that must not trigger re-render
- `React.memo` on list rows (50+), not every leaf
- `useCallback`/`useMemo` only when profiling or memo children require it
- Pure transforms in `utils/` — zero React imports

### 9.4 Backend rules

- Thin routes, fat services
- Validate at entry (Pydantic schemas)
- Typed errors, explicit handling
- User-scoped queries (multi-tenancy via `user_id`)

---

## 10. Explicitly out of scope

| Area | Reason |
|------|--------|
| `warriorplus.py` | Billing / affiliate integration |
| `hub_sync.py` internals | Hub sync — only needed for hub-launched apps |
| `.cursor/` rules and skills | Agent tooling, not app architecture |

---

## 11. Key file index

### 11.1 Frontend entry & shell

| File | Role |
|------|------|
| `frontend/src/main.tsx` | React entry |
| `frontend/src/App.tsx` | Routes + auth gate |
| `frontend/src/components/layout/MainLayout.tsx` | Provider tree + layout |
| `frontend/src/components/layout/MainContent.tsx` | Editor orchestrator |
| `frontend/src/components/layout/Sidebar.tsx` | Panel navigation |

### 11.2 Canvas core

| File | Role |
|------|------|
| `frontend/src/components/layout/FabricCanvasItem.tsx` | Lazy-mount shell |
| `frontend/src/components/layout/FabricCanvasItemActive.tsx` | Active Fabric instance |
| `frontend/src/hooks/canvas-editor/use-canvas-editor.ts` | Main editor hook |
| `frontend/src/utils/canvas-state-store.ts` | In-memory page JSON store |
| `frontend/src/hooks/canvas-editor/use-fabric-canvas-lifecycle.ts` | Init/dispose |
| `frontend/src/hooks/canvas-editor/use-fabric-canvas-visibility.ts` | IntersectionObserver |

### 11.3 Save / export / download

| File | Role |
|------|------|
| `frontend/src/context/CanvasSaveContext.tsx` | Save registration |
| `frontend/src/context/CanvasExportContext.tsx` | Export factory |
| `frontend/src/hooks/use-canvas-saves.ts` | Save API + state |
| `frontend/src/hooks/use-canvas-download.ts` | Download orchestration |
| `frontend/src/utils/run-canvas-export.ts` | Chunked export runner |

### 11.4 Backend

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI app |
| `backend/app/api/routes/__init__.py` | Router aggregation |
| `backend/app/core/dependencies.py` | Auth dependencies |
| `backend/app/services/canvases_service.py` | Canvas persistence |
| `backend/app/services/projects_service.py` | Project settings |
| `backend/app/services/launch_auth_service.py` | Hub token verification |
| `backend/app/services/storage_service.py` | Image upload |
| `backend/app/services/download_quota_service.py` | Download limits |

### 11.5 Infrastructure

| File | Role |
|------|------|
| `docker-compose.yml` | Redis, backend, workers |
| `Dockerfile` | Backend image |
| `frontend/vite.config.ts` | Dev server + API proxy |

---

## 12. Mental model for AI assistants

When modifying or extending this codebase:

1. **Start from `MainContent`** — it owns `CanvasStateStore`, registers save/export getters, and renders all pages.
2. **New sidebar feature** → panel component + optional hook + optional `api/` + `types/` + custom event if it must reach the canvas without deep props.
3. **New canvas behavior** → pure util in `utils/` first; wire in `use-fabric-canvas-lifecycle.ts` or `use-canvas-editor.ts`.
4. **New API endpoint** → `schemas/` → `services/` → `api/routes/` (never skip the service layer).
5. **Scale-sensitive code** → lazy mount, chunk + `yieldToMainThread()`, `Map` lookups, debounce thumbnails.

This spec describes a **reusable multi-page Fabric.js book editor** with hub auth, Supabase persistence, and client-side export.
