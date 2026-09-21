---
name: studio-template
description: Implement or modify Studio worksheet templates (utils/studio/*). Use when adding a new studio game from a docs/Studio template *.md spec, wiring registry, answer keys, or fixing grid/layout/instruction issues.
---

# Studio Template Implementation

Follow this skill when implementing or changing a Studio template under `frontend/src/utils/studio/`.

## Before coding

1. Read the one-template spec in `docs/Studio template *.md`.
2. Skim a similar existing template (folder + `generate.test.ts`).
3. Apply project rules: `studio-layout.mdc`, `studio-fabric-text.mdc`, `studio-answer-ink.mdc`, `clean-code.mdc`.

## File layout

```
frontend/src/utils/studio/<template-key>/
  generate.ts          # template definition + page draw
  generate.test.ts     # contract + template-specific asserts
  *.ts                 # pure helpers (solver, streams, …) — no React
```

Wire once in `constants/studio-templates.ts` (`RAW_TEMPLATES`). `StudioPanel` discovers via registry — no panel edits.

## Layout (required)

- **Safe area first:** every emitted object (structure / prompt / decoration / hidden `answer`) must stay inside the page safe area. Start from `insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)` then `drawHeader`. Never place from page origin or past `ctx.margin`.
- Reserve padding for answer rings, stroke width, circle radius, and centered origins — halos like `left - 2` must still land inside the safe box (inset the field before drawing rings).
- When packing many puzzles/options, clamp or scale to fit `header.body` — do not let strips spill past the bottom/right safe edge.
- **Center on canvas (required):** after the header, the main puzzle block **and** answer-key content must be optically centered in `header.body` — both horizontally and vertically. Do not top-left stick content under the title with empty space on the other sides. Use `fitSquareGrid` / `columns`+`rows` inside a field that is itself centered (`field.top + (field.height - blockH) / 2`, and shrink-wrap + center horizontally when the block is narrower than the body).
- **Balance & polish:** page must look even and print-ready — consistent gutters; aligned columns; equal-sized cells/options; no top-heavy or lopsided whitespace; figures still legible at the smallest size.
- After integer snap, **re-center in the field** (do not only round the floated origin).
- List / multi-column sheets: keep index gutters aligned; center prompts/answers in the content band (or center the whole run) so the sheet reads as one composition on the canvas.
- Answer keys that omit prompts still center the revealed answers in their cells/bands — never leave answers flush-left under a missing prompt.
- Group the puzzle block with `buildGroup` + `unionObjectBounds` when it is one movable unit (Sudoku-style grids).
- Details: `studio-layout.mdc` (safe area + balance + centering + strokes).

## Grid strokes

- One stroke per line — never stack per-cell rects + box rects.
- Prefer filled ink bars (`buildRect` fill ink, `strokeWidth: 0`) over stroked `Line` for even weight.
- Box edges: `STUDIO_STROKE_BOLD`; cell edges: `STUDIO_STROKE_HAIRLINE`.
- Integer coordinates for bars and digit anchors.

## Copy & digits

- Instruction text from **config** (size, box dims, difficulty labels) — not hardcoded classic defaults that disagree with the grid.
- Number-grid digits: `fontWeight: 'normal'` unless the spec requires bold givens.
- Short labels / prompts / answers: `estimateTextBoxWidth` so textbox width equals the glyph run — never inflate width or stretch to the column (`studio-fabric-text.mdc`).

## Answer keys

- `producesAnswerKey: true` → generate **always** adds a solution page (no form toggles).
- Hidden `studioRole: 'answer'` objects on the puzzle page.
- B&W / print-first templates: add key to `STUDIO_ANSWER_INK_MONO_TEMPLATES` (`studio-answer-ink.mdc`).
- When answers share anchors with prompts, omit prompts on the key (`shouldOmitFromAnswerPage`) so they do not overlap — and **center** the revealed answers in the content band.
- Answer text = intended solution only (no “also fits” / alternate clutter unless the spec requires it).
- **Symbol Hunt `shapes` pool:** never include ring/disc glyphs (`○` `●` `⊗` `⊕` … in `SHAPE_RING_GLYPHS`) — cancel answer circles would double-halo. Prefer 1–2 path basic shapes (square, triangle, diamond, cross, star). Keep the generate.test exclusion green when editing the pool.

## Tests

- `runGeneratorContractTests(template)` from `studio-generator-test.ts` (includes **safe-margin** assert — must stay green).
- Determinism, seed variance, answer harvest, size/difficulty matrix as relevant.
- For dense layouts, assert the **max** config still fits (e.g. max items per page).
- For uniqueness-critical solvers (Sudoku): stress-test in CI (many seeds).
- Prefer asserting center / group / mono ink when those are product requirements.

## Typecheck / Docker build (required)

Docker frontend image runs `tsc && vite build`. `tsc` fails on unused locals (`TS6133`) and other strict checks that Vitest does **not** catch.

After editing any of these paths, run typecheck before finishing:

- `frontend/src/utils/studio/**`
- `frontend/src/hooks/studio/**`
- `frontend/src/constants/studio*.ts`
- `frontend/src/types/studio-template.types.ts`
- `frontend/src/components/panels/studio/**`

```bash
cd frontend && npx tsc --noEmit
```

Rules:

- Do not leave unused imports, variables, or parameters (`TS6133`).
- Prefer delete dead code over `_` prefix unless the binding is required by a signature.
- Vitest green alone is **not** enough — typecheck must pass too (same gate as Docker `npm run build`).

## Checklist

- [ ] Registry entry + unique `key` + correct `category`
- [ ] **All content inside safe area** (incl. answer halos / strokes); contract safe-margin test green
- [ ] **Centered on canvas** — puzzle + answer-key blocks optically centered in `header.body` (H + V)
- [ ] **Balanced & polished** — even gaps, aligned columns, legible min size
- [ ] Grid grouped when appropriate
- [ ] Strokes uniform; instruction matches config
- [ ] `producesAnswerKey` + mono ink set if B&W; answers centered / no prompt overlap
- [ ] Tests green (`vitest run src/utils/studio/<key>`)
- [ ] `npx tsc --noEmit` green (no unused locals / TS errors — Docker build gate)
