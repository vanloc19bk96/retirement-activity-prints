# RETIREMENT ACTIVITY PRINTS

## Retirement Word Search — Production Specification

### 1. Product objective

`Retirement Word Search` phải là một template riêng của **Retirement Activity Prints**, không phải Word Search từ Memory Activity Prints chỉ đổi tên.

Mục tiêu:

* Tạo word-search pages dành cho retirement activity books.
* Mang cảm giác thư giãn, vui vẻ, tích cực.
* Nội dung xoay quanh retirement lifestyle.
* Large-print friendly mặc định.
* Print-first, phù hợp paperback/hardcover.
* Có answer key chính xác 100%.
* Không có orphan words.
* Không có accidental duplicate target words.
* Có content diversity đủ tốt để tạo sách nhiều puzzle.
* Có safeguards để hạn chế copyrighted/trademarked/generated-risk content.
* Có KDP preflight trước export.

Market positioning phù hợp vì retirement activity books hiện tại vẫn sử dụng word search và một số sách đặc biệt nhấn mạnh large-print cho retiree audience.

---

# 2. Architecture

## 2.1 Không duplicate placement engine

Tách Word Search thành:

```text
frontend/src/utils/puzzles/word-search-core/
├── placement.ts
├── mix.ts
├── scan.ts
├── types.ts
└── rng.ts

frontend/src/utils/studio/retirement-word-search/
├── generate.ts
├── config.ts
├── prefetch.ts
├── retirement-wordlists.ts
├── retirement-themes.ts
├── content-quality.ts
├── draw.ts
└── kdp-preflight.ts
```

`placement.ts` và `mix.ts` lấy trực tiếp logic tốt từ Memory Activity Prints.

Hiện Word Search cũ đã phân tách khá sạch thành generate/config/prefetch/placement/mix/draw/wordlists.

Không nên maintain hai implementation của DFS placement.

---

# 3. Những phần GIỮ từ Memory Activity Prints

Giữ:

```text
✓ Seeded RNG
✓ Longest-word-first placement
✓ DFS/backtracking
✓ Same-letter overlap
✓ Multiple placement directions
✓ Node budget
✓ Grow-grid retry
✓ Trim-list retry
✓ packingBudget()
✓ Placement data structure
✓ Automatic answer key
✓ Transparent answer capsules
✓ placed words = clue words
```

Engine hiện có maximum 12,000 DFS nodes mỗi attempt, multiple restarts và shared resolve budget 48,000 nodes. Đây là safeguard tốt để UI không bị treo.

Giữ nguyên principle:

```text
clue list == successfully placed words
```

Không bao giờ có từ trong word bank nhưng không tồn tại trong grid.

---

# 4. Những phần PHẢI THAY

Memory version hiện có:

```text
source:
- ai
- custom

blank AI theme:
"everyday objects"
```

Retirement version đổi thành:

```text
source:
- curated
- ai
- custom
```

Default:

```text
source = curated
```

Không dùng AI mặc định.

Không sử dụng:

```text
everyday objects
```

làm fallback.

---

# 5. Config schema

```ts
interface RetirementWordSearchConfig {
  source:
    | 'curated'
    | 'ai'
    | 'custom'

  retirementCategory: RetirementThemeCategory

  presetThemeId?: string

  customTheme?: string

  customWords?: string

  difficulty:
    | 'relaxed'
    | 'classic'
    | 'challenge'

  printStyle:
    | 'large-print'
    | 'standard'

  gridSize:
    | 'auto'
    | number

  wordCount:
    | 'auto'
    | number

  pageTitle?: string

  showInstructions: boolean

  showThemeSubtitle: boolean

  puzzleNumber?: number

  seed: number
}
```

Defaults:

```text
source          = curated
difficulty      = classic
printStyle      = large-print
gridSize        = auto
wordCount       = auto
showInstructions = true
```

`gridSize` và `wordCount` nên nằm dưới:

> Advanced Settings

User thông thường chỉ cần chọn:

```text
Theme
Difficulty
Generate
```

---

# 6. Retirement theme taxonomy

Không cho user thấy một generic input đầu tiên.

UI nên cho chọn category → theme.

## Category A — Retirement Life

```text
Life After Work
Retirement Freedom
The New Chapter
Perfect Retirement Day
Free Time
Relax & Unwind
No More Mondays
Retirement Celebration
```

## Category B — Travel & Adventure

```text
Travel Dreams
Road Trips
Dream Destinations
Around the World
Weekend Getaways
Vacation Time
Outdoor Adventures
Travel Essentials
```

## Category C — Hobbies & Leisure

```text
New Hobbies
Gardening
Photography
Arts & Crafts
Cooking & Baking
Reading & Learning
Birdwatching
DIY Projects
Music & Dance
Classic Pastimes
```

## Category D — Career & Farewell

```text
Career Memories
Office Goodbye
Workplace Memories
Retirement Party
Career Milestones
Work Friends
Life Beyond Work
```

## Category E — Nostalgia

```text
School Days
Classic Pastimes
Retro Technology
Vintage Home
Old-School Travel
Memory Lane
Then & Now
Decade Memories
```

"Nostalgia" ở đây chỉ là entertainment theme, không phải cognitive/memory training.

## Category F — Friends & Family

```text
Friends & Family
Family Gatherings
Good Friends
Social Life
Celebrations
Quality Time
```

## Category G — Active Retirement

```text
Walking & Nature
Outdoor Life
Active Retirement
Healthy Habits
Mindful Moments
Nature Lovers
Everyday Wellness
```

Không được generate medical claims như:

```text
prevent dementia
reverse aging
cure memory loss
```

## Category H — Home & Leisure

```text
Cozy Home
Garden Days
Home Projects
Weekend Fun
Relaxing Hobbies
Kitchen Fun
Creative Time
```

---

# 7. Curated word bank

Đây là một thay đổi quan trọng.

Mỗi preset theme phải có một **human-authored / human-reviewed word pool riêng**.

Target:

```text
40–80 unique entries/theme
```

Ví dụ:

```ts
{
  id: 'travel-dreams',
  label: 'Travel Dreams',

  words: [
    'Adventure',
    'Passport',
    'Journey',
    'Explore',
    'Vacation',
    'Road Trip',
    'Getaway',
    'Scenery',
    'Suitcase',
    'Souvenir',
    'Relax',
    'Discover',
    ...
  ]
}
```

Không lấy word list từ competitor books.

Không scrape Amazon books.

Không copy online puzzle lists.

Word pools phải do product owner tạo hoặc sở hữu quyền sử dụng.

---

# 8. Multi-word support

Memory engine hiện strip tất cả non-A–Z và chỉ giữ một sanitized string.

Retirement version cần tốt hơn vì các phrase như:

```text
ROAD TRIP
FREE TIME
NEW HOBBY
DREAM TRIP
GARDEN CLUB
```

rất phù hợp retirement.

Data structure đổi thành:

```ts
interface WordEntry {
  display: string
  token: string
}
```

Ví dụ:

```json
{
  "display": "Road Trip",
  "token": "ROADTRIP"
}
```

Grid sử dụng:

```text
ROADTRIP
```

Word bank hiển thị:

```text
Road Trip
```

Không hiển thị:

```text
ROADTRIP
```

---

# 9. sanitizeWordEntry()

Pipeline:

```text
input
  ↓
trim
  ↓
collapse repeated spaces
  ↓
preserve clean display string
  ↓
uppercase
  ↓
remove spaces / hyphens / apostrophes
  ↓
A-Z validation
  ↓
length validation
  ↓
dedupe
```

Ví dụ:

```text
"Road Trip"
   ↓
display = "Road Trip"
token   = "ROADTRIP"
```

English V1 chỉ hỗ trợ A–Z.

Nếu sau này thêm Spanish/French/German:

> phải implement locale-aware grid engine.

Không silently strip accented characters trong language khác.

---

# 10. Word length rules

## Large Print

Recommended:

```text
minimum: 4 letters
maximum: 10 letters
```

Challenge có thể:

```text
maximum: 12 letters
```

Không nên để AI tạo quá nhiều:

```text
3-letter words
12+ letter words
```

vì chúng hoặc quá dễ, hoặc làm grid chật.

Custom source có thể cho 3 letters, nhưng hiển thị warning:

> Short words may appear multiple times accidentally and can reduce puzzle quality.

---

# 11. Difficulty system

Không gọi user-facing là:

```text
Easy
Medium
Hard
```

Đổi thành:

```text
Relaxed
Classic
Challenge
```

Internally vẫn map:

```text
relaxed   → easy
classic   → medium
challenge → hard
```

Như vậy có thể giữ engine cũ.

---

# 12. Relaxed mode

Target retiree-friendly.

```text
Grid:       10 × 10
Words:      8
Length:     4–8
Directions: East + South
Diagonal:   No
Backwards:  No
```

Instruction:

> Find and circle the words. They appear across or down.

Không generate reverse words.

Không diagonal.

---

# 13. Classic mode

Default.

```text
Grid:       12 × 12
Words:      10–12
Length:     4–10
Directions:
E
S
SE
SW

Backwards:
No
```

Target:

```text
20–30% diagonal
```

Instruction:

> Find and circle the words. They may appear across, down, or diagonally.

Memory engine hiện đã hỗ trợ chính xác direction behavior này cho Medium.

---

# 14. Challenge mode

```text
Grid:       14 × 14
Words:      14–16
Length:     4–12
Directions: all 8
```

Target:

```text
Diagonal: 25–35%
Backwards: 15–25%
```

Instruction:

> Find and circle the words. They may run in any direction, and some are backwards.

Không nên mặc định lên tới 25 words như Memory version.

Retirement Activity Prints ưu tiên readability hơn density.

---

# 15. Grid size auto-selection

```ts
function retirementGridSize(
  difficulty,
  printStyle
) {
  if (printStyle === 'large-print') {
    return {
      relaxed: 10,
      classic: 12,
      challenge: 14
    }[difficulty]
  }

  return {
    relaxed: 11,
    classic: 13,
    challenge: 15
  }[difficulty]
}
```

Cho phép Advanced override:

```text
8–15
```

như engine hiện tại.

---

# 16.
