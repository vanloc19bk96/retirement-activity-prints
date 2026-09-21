# Retirement Activity Prints – Decade Trivia Spec

## Template
- key: `decade-trivia`
- category: `reminiscence`
- producesAnswerKey: true
- 1 puzzle page + 1 automatic answer key
- Target: Adults / Retirees / Seniors (reminiscence therapy)
- Print-first, large-print friendly, B&W, KDP safe area
- AI content: yes (Gemini write + independent verify)
- Discovered via Studio registry — no special wiring in `StudioPanel`

## Goal
Player answers nostalgia trivia about a chosen decade (music, TV, films, products, everyday life, etc.).

Formats on the page:
- Multiple choice (A–D)
- Short answer (question + handwriting line)
- Fill in the blank (sentence with `___`)
- Mixed (even split of the three)

Questions are AI-written and fact-checked. Authors should still spot-check before publishing.

---

## Config

### `customDecade` (toggle)
- Off (default): pick from the decade select
- On: type a custom decade label

### `decade`
Select (when custom decade is off):
- 1950s, 1960s, 1970s, 1980s, 1990s, 2000s

Default: `1960s`

### `customDecadeText`
- Visible when custom decade = on
- Normalized to a label like `1940s` / `2010s` (accepts `2010`, `the 2010s`, or a year in the decade)
- max 24 chars
- Must match `\d{4}s` after normalize

### `customTopic` (toggle)
- Off (default): tick preset topics
- On: one free-text topic instead of the multi-select

### `topics` (multiSelect)
Preset ids (contract with backend `topics.json`):

| Id | Label |
|----|--------|
| `music` | Music |
| `tv` | TV |
| `film` | Film |
| `products` | Products & brands |
| `food` | Food |
| `toys` | Toys & games |
| `everyday` | Everyday life |
| `events` | Events |

Default ticked: `music`, `tv`, `film`, `products`, `events`

Rules:
- Only ticked topics appear on the page
- Empty selection is invalid (no silent fallback to defaults)
- Soft warning when more topics are ticked than `questionCount` (some topics will not get a seat)

### `customTopicText`
- Visible when custom topic = on
- max 80 chars
- Required when custom topic is on

### `format` (Question style)
- `multiple-choice` (default)
- `short-answer`
- `fill-blank`
- `mixed`

### `difficulty`
- Easy: facts almost anyone who lived through the decade would remember
- Standard (default): well-known facts a person of that era would likely recall
- Challenging: well-known but less obvious facts — still widely documented

### `questionCount`
- default: 5
- min: 4
- max: 8
- Fewer questions keep large print readable (4–5 best on 6×9)

### Shared
Use existing Studio settings:
- title
- fontFamily
- seed
- page size
- etc.

---

## AI Content Generation

ALL questions come from the backend (`POST /api/studio/decade-trivia`).
Do NOT ship a bundled trivia bank as the primary content source.

### Request payload

```
{
  decade,
  topics,
  format,
  difficulty,
  questionCount,
  seed,
  avoid?,
  locale?
}
```

Frontend builds this via `toDecadeTriviaRequest` + `studioAvoidList(varietyKey)`.

### Pipeline (lossy by design)

A short correct page beats a wrong full page. Any stage may drop items.

1. **Write** — Gemini over-requests (`questionCount + overRequest`, default +5).
2. **Validate** (deterministic):
   - confidence ≥ `minConfidence` (default 0.85)
   - no hedged answers (`probably`, `around`, `maybe`, …)
   - editorial / KDP safety (blocked terms, copyright cues — no lyrics, slogans, dialogue quotes)
   - years in text and `evidence_year` must fall inside the decade
   - topic allow-list + off-topic cue pre-filter
   - format shape (see Formats)
3. **Verify** — second independent model pass (default on):
   - re-derives each answer; keep only `verdict: correct`
   - `decade_ok` must be true
   - checker assigns final `topic`; must be one the author ticked (or `"other"` → drop)
4. **Top up** — up to `maxRounds` (default 3). Later rounds focus only on missing ticked topics.
5. **Compose** — topic coverage first, then format mix, then fill remaining seats.
6. **Shuffle** — MC options shuffled with seeded RNG so the key is not always letter A.
7. **Remember** — store printed questions in variety scope so consecutive pages avoid repeats.

If nothing survives fact-checking → generation error (frontend shows retry message).

Brand *names* are allowed for Products & brands; copyrighted *wording* (slogans, jingles, lyrics) is not.

---

## Formats

### Multiple choice
- Exactly 4 options
- Options unique (case-insensitive)
- `answer` must appear in `options` with the same spelling
- Rendered as 2×2 grid: A B / C D with letter markers
- Hidden answer ring on the correct letter for the solution page

### Short answer
- No options
- Concise write-in (about 1–4 words)
- Puzzle: question + handwriting rule under it
- Answer key: answer text; write-in rule omitted

### Fill in the blank
- No options
- Exactly one blank marked `___` (normalized to a wider underscore run for handwriting)
- Blank must be a whole word/phrase with spaces — never glued digits like `19___` + answer `1961`
- Backend repairs glue when unambiguous; otherwise drops the item
- Puzzle: sentence with blank; answer key: same sentence with answer filled in (blanked prompt text omitted)

### Mixed
Even split across MC / short-answer / fill-blank for `questionCount`.
Remainder seats rotate so no style monopolizes extras.
Coverage of ticked topics outranks a perfect format mix.
Surplus MC may be safely reformatted to short-answer when the mix still owes short-answer seats (fill-blank is never invented by reformatting).

---

## Puzzle Layout

Instruction (config-driven decade):
`How much do you remember about the {decade}? Take your time. No rush, no score`

Layout rules:
- Large-print body target ~16pt (floor ~14pt; denser 8-question pages may step toward 12pt)
- Number each question in a left gutter
- Stack measured blocks (prompt + options or write-in) with non-overlapping heights
- Font preloaded in prefetch so wrap metrics match Fabric render
- Entire stack inside Studio/KDP safe area; bottom pad keeps last block off the margin guide
- Optically center the question stack in `header.body`
- Prefers 4–5 questions on small trims; denser pages shrink type/gaps rather than overflow

---

## Answer Key

Generated automatically (`producesAnswerKey: true`, mono answer ink).

Behavior:
- MC: same questions + options; reveal ring on correct letter
- Short answer: reveal answer text; drop handwriting lines (`structure`)
- Fill-blank: replace blanked prompt with in-sentence answer text
- Puzzle and key must share the same items/order

Authors should spot-check AI facts before publishing.

---

## Variety

Use:
`studioVarietyKey('decade-trivia', decade, topicsJoined, format, difficulty)`

Remember recently printed questions and send them in `avoid`
so consecutive pages/books do not repeatedly ask the same facts.

Backend variety scope buckets by decade + topics + format + difficulty + seed.

---

## Validation / Tests

Must verify:
- requested `questionCount` when enough items survive (short page allowed if filters drop content)
- at least one topic required; empty topics never hit the API
- custom decade / custom topic validation messages
- MC: 4 unique options; answer ∈ options
- fill-blank: repaired blank; no answer leak into question; no glued digit blanks
- no duplicate questions or answers on one page
- years / evidence_year inside decade
- verification keeps only `correct` + `decade_ok` + allowed topic
- topic coverage preferred over format mix when composing
- MC option shuffle is seed-deterministic; correct letter not stuck on A
- layout fits max config (8 questions) inside safe area
- puzzle and answer key match; mono ink registered for `decade-trivia`
- same seed + variety → same page when model path is stubbed in tests
