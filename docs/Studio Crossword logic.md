# RETIREMENT ACTIVITY PRINTS

## Retirement Crossword — Production Specification

### AI-Only / Large-Print / KDP-Ready Direction

---

# 1. Product Goal

`Retirement Crossword` tạo crossword dành riêng cho Retirement Activity Books.

Không phải Crossword generic từ Memory Activity Prints chỉ đổi theme.

Mỗi puzzle phải:

* Có nội dung liên quan rõ ràng đến retirement.
* Answer và clue đều được AI tạo mới.
* Clue tự nhiên, dễ hiểu, không chứa answer.
* Grid crossword interlocking hợp lệ.
* Across/Down numbering chính xác.
* Có answer key tự động.
* Large-print friendly.
* Không silently bỏ clue/answer mà user không biết.
* Không dùng filler clue kiểu `_ _ _ (7 letters)`.
* Không fallback về generic/bundled vocabulary.
* Có kiểm tra duplicate/repetition ở cấp book.
* Có AI/IP/content safeguards.
* Có KDP preflight trước export.

---

# 2. Những gì nên REUSE từ Crossword hiện tại

Crossword hiện tại đã có architecture khá tốt:

```text
generate.ts
prefetch.ts
construct.ts
validate.ts
draw.ts
draw-clues.ts
types.ts
```

và dùng shared lattice renderer.

Giữ lại:

```text
✓ buildCrossword()
✓ Backtracking packer
✓ Crossing validation
✓ Connectivity validation
✓ Standard crossword numbering
✓ Across / Down separation
✓ Shared lattice-grid renderer
✓ Answer-key harvesting
✓ Seeded RNG
✓ Max node budget
✓ Substitute candidate concept
✓ Error page on construction failure
```

Current packer đã enforce:

* word không được nối kéo dài bất hợp lệ;
* perpendicular touching bị cấm;
* các word sau seed phải cross ít nhất một lần;
* white cells phải connected;
* crossing letters phải nhất quán;
* puzzle phải có cả Across và Down.

Đây là foundation tốt, không cần viết lại.

---

# 3. Không chỉnh trực tiếp `StudioPanel`

Giữ nguyên architecture principle hiện tại:

```text
StudioPanel
   ↓
template registry
   ↓
Retirement Crossword module
```

Crossword logic không nên nằm trong panel. Current project cũng đã thiết kế StudioPanel chỉ làm nhiệm vụ mở form và gọi generator.

---

# 4. Architecture đề xuất

Không duplicate toàn bộ crossword solver.

Có thể tổ chức:

```text
frontend/src/utils/puzzles/crossword-core/
├── construct.ts
├── validate.ts
├── numbering.ts
├── intersection.ts
├── types.ts
└── scoring.ts

frontend/src/utils/studio/retirement-crossword/
├── generate.ts
├── config.ts
├── prefetch.ts
├── retirement-themes.ts
├── ai-content.ts
├── content-quality.ts
├── clue-validator.ts
├── candidate-selector.ts
├── draw.ts
└── kdp-preflight.ts
```

Nếu chưa muốn refactor:

> Retirement Crossword có thể import `construct.ts` và `validate.ts` hiện tại.

Nhưng **không copy/paste một phiên bản solver khác**.

---

# 5. BỎ các feature của Memory Crossword

Current Crossword có:

```text
source:
- theme
- custom

preset bundled themes
custom AI theme
custom WORD | clue list
```

Retirement Crossword bỏ:

```text
❌ source selector
❌ custom word list
❌ WORD | clue textarea
❌ bundled crossword word pools
❌ generic Animals theme
❌ generic Food theme
❌ offline word-bank fallback
❌ length-hint clue fallback
```

Retirement Crossword chỉ có:

```text
AI-generated content
```

---

# 6. Theme presets KHÔNG phải curated content

`retirement-themes.ts` chỉ chứa tên theme.

Ví dụ:

```ts
{
  category: 'travel-adventure',
  label: 'Travel & Adventure',

  themes: [
    'Travel Dreams',
    'Road Trips',
    'Dream Destinations',
    'Vacation Time',
    'Around the World'
  ]
}
```

Không chứa:

```ts
words: [...]
clues: [...]
```

Mỗi lần generate, AI tạo answer + clue mới.

---

# 7. Main Config

```ts
interface RetirementCrosswordConfig {
  retirementCategory: RetirementCategory

  themeMode:
    | 'preset'
    | 'custom'

  presetTheme?: string

  customTheme?: string

  difficulty:
    | 'relaxed'
    | 'classic'
    | 'challenge'

  printStyle:
    | 'large-print'
    | 'standard'

  answerCount:
    | 'auto'
    | number

  pageTitle?: string

  showInstructions: boolean

  seed: number
}
```

Không còn:

```ts
source
words
customWords
```

---

# 8. Default User Experience

Default:

```text
Category:
Retirement Life

Theme:
Life After Work

Difficulty:
Classic

Print Style:
Large Print

Answer Count:
Auto
```

UI chính chỉ cần:

```text
Category

Theme

Difficulty

[ Generate Crossword ]
```

Advanced:

```text
Print Style
Answer Count
Page Title
Seed / Regenerate
```

Không làm form phức tạp.

---

# 9. Retirement Categories

## Retirement Life

```text
Life After Work
Retirement Freedom
The New Chapter
Perfect Retirement Day
Free Time
Relax & Unwind
Retirement Celebration
Everyday Retirement
```

## Travel & Adventure

```text
Travel Dreams
Road Trips
Dream Destinations
Vacation Time
Around the World
Weekend Getaways
Outdoor Adventures
```

## Hobbies & Leisure

```text
New Hobbies
Gardening
Photography
Arts & Crafts
Cooking & Baking
Reading
Birdwatching
DIY Projects
Music
Classic Pastimes
```

## Career & Farewell

```text
Career Memories
Office Goodbye
Retirement Party
Workplace Memories
Career Milestones
Work Friends
Life Beyond Work
```

## Nostalgia

```text
Memory Lane
School Days
Retro Technology
Classic Pastimes
Vintage Home
Then & Now
Decade Memories
Old-School Travel
```

## Friends & Family

```text
Friends & Family
Family Gatherings
Good Friends
Celebrations
Quality Time
Social Life
```

## Active Retirement

```text
Walking & Nature
Outdoor Life
Active Retirement
Everyday Wellness
Mindful Moments
Nature Lovers
```

## Home & Leisure

```text
Garden Days
Cozy Home
Home Projects
Kitchen Fun
Creative Time
Relaxing Hobbies
Weekend Fun
```

---

# 10. Custom Theme

Cho phép:

```text
Custom Retirement Theme
```

Ví dụ:

```text
Retired Teachers
RV Adventures
Retirement Gardening
Coastal Retirement
Golf in Retirement
Life After Nursing
Retirement Travel
```

Maximum:

```text
120 characters
```

Đây vẫn là AI-only.

User chỉ nhập **theme**, không nhập answers.

---

# 11. Core Data Structure

Current system dùng:

```ts
{ word, clue }
```

Retirement version nên mở rộng:

```ts
interface RetirementCrosswordPair {
  answerDisplay: string
  answerToken: string
  clue: string

  relevanceScore?: number
  clueQualityScore?: number
  crossabilityScore?: number
}
```

Ví dụ:

```json
{
  "answerDisplay": "Road Trip",
  "answerToken": "ROADTRIP",
  "clue": "A vacation taken by car"
}
```

Grid sử dụng:

```text
ROADTRIP
```

Spaces không chiếm cell.

---

# 12. Support Short Phrases

Retirement content có rất nhiều phrase tự nhiên:

```text
Road Trip
Free Time
New Hobby
Bucket List
Garden Club
Day Trip
```

Nên cho phép:

```text
maximum 2 words
```

Normalize:

```text
Road Trip
   ↓
ROADTRIP
```

Không cho AI tự generate token.

Application tự normalize.

---

# 13. Answer Length

Recommended:

### Relaxed

```text
4–8 letters
```

### Classic

```text
4–10 letters
```

### Challenge

```text
5–12 letters
```

Không nên có quá nhiều 3-letter answers.

Crossword vẫn có thể technically support chúng nhưng chất lượng puzzle retirement tốt hơn khi vocabulary substantive hơn.

---

# 14. Difficulty không chỉ là word length

Current Crossword chủ yếu dùng difficulty để bias answer length và prompt tone.

Retirement version phải làm difficulty ảnh hưởng **clue complexity + answer length + answer count**.

---

# 15. Relaxed Mode

Designed cho enjoyable large-print experience.

```text
Target answers:
8

Candidate answers:
20–24

Answer length:
4–8

Clues:
Direct

Grid:
Auto, normally ≤ 15×15

Print:
Large
```

Ví dụ:

Answer:

```text
GARDEN
```

Clue:

> A place to grow flowers and vegetables

Không:

> A cultivated patch that may reward a green thumb

Relaxed phải rất straightforward.

---

# 16. Classic Mode

Default.

```text
Target answers:
10

Candidate answers:
24–30

Answer length:
4–10

Clues:
Direct to moderately descriptive

Grid:
Auto

Print:
Large
```

Ví dụ:

```text
PASSPORT
```

Clue:

> Document needed for international travel

---

# 17. Challenge Mode

```text
Target answers:
12

Candidate answers:
30–36

Answer length:
5–12

Clues:
Moderately indirect but fair

Grid:
Auto, may reach 17×17
```

Example:

```text
SOUVENIR
```

Clue:

> Something brought home to remember a trip

Still fair.

Do not make Challenge depend on obscure trivia.

---

# 18. Optional Standard-Print Counts

If:

```text
printStyle = standard
```

maximum may increase modestly:

```text
Relaxed   8–10
Classic   10–12
Challenge 12–14
```

But Large Print remains default.

---

# 19. Candidate Oversampling

This is critical for crossword construction.

Current system already asks AI for extra pairs because substitutes help pack stubborn answers.

Retirement Crossword should increase this idea.

Recommended:

```ts
candidateCount =
  Math.max(
    targetCount * 2.5,
    targetCount + 12
  )
```

Examples:

```text
Need 8:
generate 20–24

Need 10:
generate 25

Need 12:
generate 30
```

Why?

Because not every good semantic answer makes a good crossword answer.

---

# 20. AI Generation Prompt

Concept:

```text
Create candidate answer-and-clue pairs for a
professional printable retirement crossword.

Audience:
Adults and retirees.

Category:
{{category}}

Theme:
{{theme}}

Difficulty:
{{difficulty}}

Generate:
{{candidateCount}} candidates.
```

AI rules:

```text
Answers must:

- clearly relate to the theme
- be common, understandable English
- be one word or a short two-word phrase
- normalize to the allowed length
- be distinct from each other
- not simply be variations of another answer
```

Clues must:

```text
- uniquely point toward the intended answer
- be clear and grammatically natural
- match the requested difficulty
- not contain the answer
- not contain an obvious inflection of the answer
- not reveal the answer through spelling
- be concise enough for a printed clue list
- be factually safe
```

---

# 21. AI Response

Require strict JSON:

```json
{
  "items": [
    {
      "answer": "Road Trip",
      "clue": "A vacation taken by car"
    },
    {
      "answer": "Garden",
      "clue": "A place to grow flowers and vegetables"
    }
  ]
}
```

No commentary.

No markdown.

---

# 22. Clue Length

This is especially important for layout.

Recommended:

```text
Relaxed:
≤ 55 characters

Classic:
≤ 65 characters

Challenge:
≤ 70 characters
```

Preferred:

```text
4–10 words
```

Avoid paragraph-style clues.

Bad:

> Something many retired people may enjoy doing during the warmer months when they have additional free time.

Better:

> Outdoor activity involving plants and flowers

Answer:

```text
GARDENING
```

---

# 23. No Answer Echo

Current Crossword already rejects clues containing the answer.

Retirement version strengthens this.

Reject:

```text
Answer:
GARDEN

Clue:
A garden space behind the house
```

Also reject morphological echo:

```text
Answer:
TRAVEL

Clue:
What a traveler loves to do
```

because:

```text
TRAVEL
TRAVELER
```

gives away too much.

---

# 24. `clueContainsAnswerFamily()`

Add:

```ts
clueContainsAnswerFamily(
  answerToken,
  clue
)
```

Check:

```text
exact normalized answer
plural form
-ing variation
-ed variation
-er variation
obvious stem overlap
```

Don't over-aggressively reject unrelated words that happen to share three letters.

---

# 25. No Length-Hint Fallback

Current Crossword can ultimately fall back to:

```text
_ _ _ _ _ (5 letters)
```

when clue generation is missing.

Remove this entirely.

Retirement production rule:

```text
Every answer must have a real clue.
```

If clue fails validation:

```text
regenerate clue
```

If still bad:

```text
drop candidate
```

If insufficient candidates:

```text
retry AI
```

If still insufficient:

```text
fail generation
```

Never publish a pseudo-clue.

---

# 26. AI Generation Retry

Recommended:

```text
Generation attempt 1
        ↓
validate
        ↓
enough good candidates?
   yes ─────→ continue
   no
        ↓
Generation attempt 2
using avoid/rejected list
        ↓
validate
        ↓
still insufficient?
        ↓
Generation attempt 3
```

Maximum:

```text
3 AI attempts
```

Then show:

> We couldn't create enough high-quality crossword content for this theme. Try again or choose a broader retirement theme.

---

# 27. No Bundled Fallback

Current Memory Crossword has approximately 10 bundled theme pools and can fall back to those when AI fails.
Retirement Crossword:

```text
NO bundled answer database

NO local clue fallback

NO generic fallback theme
```

If AI fails:

```text
fail visibly
```

This matches the AI-only architecture you requested.

---

# 28. AI Content Safety Rules

AI should not generate:

```text
brands
company names
commercial products
celebrities
public figures
fictional characters
franchises
movie titles
TV titles
book titles
song titles
lyrics
sports team names
commercial slogans
political figures
medical claims
offensive content
adult content
```

Default crossword should use **generic retirement vocabulary**, not copyrighted/pop-culture trivia.

Amazon places responsibility for rights/compliance on the publisher, so generated content should be conservative about third-party material.

---

# 29. Custom Theme Risk Check

If user types:

```text
Disney Retirement
Taylor Swift Songs
Marvel Retirement
Star Wars Fans
```

show:

> This theme may involve third-party intellectual property. Choose a generic retirement theme for content intended for commercial publishing.

Generic alternatives may be suggested:

```text
Theme Park Adventures
Music Memories
Space Adventures
Superhero Adventures
```

Do not automatically publish the risky version.

---

# 30. Retirement Tone

Default output should feel:

```text
positive
relaxing
engaging
friendly
optimistic
adult
respectful
```

Avoid age stereotypes like:

```text
frail
forgetful
senile
old timer
memory loss
useless
decline
```

And avoid unsupported health claims.

This is an activity product, not a medical intervention.

---

# 31. AI Candidate Validation

Every generated pair goes through:

```text
Answer validation
      ↓
Clue validation
      ↓
Theme relevance
      ↓
IP/content filter
      ↓
Duplicate filter
      ↓
Crossability scoring
```

Only then is it eligible for the grid.

---

# 32. Theme Relevance Score

Each answer gets:

```text
0 = unrelated
1 = weak
2 = relevant
3 = strongly relevant
```

Require:

```text
>= 2
```

Example theme:

```text
Retirement Travel
```

Good:

```text
PASSPORT
CRUISE
GETAWAY
SUITCASE
SCENERY
JOURNEY
```

Weak:

```text
CHAIR
WINDOW
THING
PEOPLE
NUMBER
```

Reject generic filler vocabulary.

---

# 33. Clue Quality Score

Rate:

```text
0 = invalid
1 = weak/ambiguous
2 = good
3 = excellent
```

Require:

```text
>= 2
```

Reject if clue:

* contains answer;
* contains answer family;
* is ambiguous;
* is factually questionable;
* is awkward;
* is too long;
* requires obscure specialist knowledge;
* doesn't match theme;
* has multiple obvious answers among candidates.

---

# 34. Candidate Deduplication

Reject combinations like:

```text
TRAVEL
TRAVELING

GARDEN
GARDENING

VACATION
VACATIONS

CRUISE
CRUISING
```

Choose only the strongest candidate.

Also avoid near-synonym overload:

```text
TRIP
JOURNEY
VOYAGE
TRAVEL
GETAWAY
```

all in one 8-answer puzzle.

A few related words are fine; the entire crossword should not feel repetitive.

---

# 35. Crossability Analysis

This should be the biggest technical improvement over current pipeline.

Before calling `buildCrossword`, create an **intersection graph**.

Each answer = node.

Two answers connect if they share at least one letter.

Example:

```text
GARDEN
ADVENTURE
```

share:

```text
A
D
E
```

Good crossing potential.

---

# 36. Crossability Score

For each candidate calculate:

```ts
crossabilityScore =
  numberOfOtherAnswersWithSharedLetters
  + weightedNumberOfPossibleCrossings
```

Prefer answers that:

```text
cross several other candidates
contain useful common letters
are not dominated by rare repeated patterns
```

Reject isolated candidates with:

```text
0 possible intersections
```

before the expensive backtracking stage.

---

# 37. Candidate Subset Selection

Do not simply:

```text
take first 10 AI answers
```

Instead:

```text
30 valid AI candidates
        ↓
intersection graph
        ↓
score semantic quality
        ↓
score clue quality
        ↓
score crossability
        ↓
select best ~18 candidate pool
        ↓
buildCrossword target = 10
```

This dramatically increases construction reliability.

---

# 38. Candidate Composite Score

Concept:

```ts
score =
    relevanceScore      * 3
  + clueQualityScore    * 3
  + crossabilityScore   * 2
  + lengthFitScore
  + freshnessScore
```

Do not let crossability override content quality.

A weak retirement word does not become acceptable merely because it crosses well.

---

# 39. Solver Behavior

Reuse current word-first backtracking solver.

Current algorithm:

```text
longest first
seed horizontally
find letter intersections
alternate Across / Down
prefer compact layouts
backtrack
allow skip/substitute
retain densest valid build
```

and caps each attempt at 20,000 nodes.

Keep those protections.

---

# 40. Retirement Target Counts

For Large Print:

```text
Relaxed:
8

Classic:
10

Challenge:
12
```

Avoid the current default of 14 for retirement large-print use.

Current Crossword supports 6–15 theme answers with 14 as default.

That is fine technically, but visually aggressive when clue text also needs to remain large.

---

# 41. Solver Fallback

Recommended:

```text
Try target count
      ↓
3 placement passes
      ↓
failed/too short?
      ↓
try alternate candidate subset
      ↓
failed?
      ↓
new subset from AI pool
      ↓
failed?
      ↓
request replacement AI candidates
      ↓
retry
```

Allow:

```text
target - 1
```

only if necessary.

For example:

```text
Classic requested 10

9 successfully placed
```

may be accepted.

But:

```text
10 requested
6 placed
```

must not silently ship.

---

# 42. Minimum Publish-Quality Counts

```text
Relaxed:
minimum 7

Classic:
minimum 9

Challenge:
minimum 10
```

Below these:

```text
regenerate
```

not:

```text
ship smaller crossword
```

---

# 43. No Broken Error Page in Book Builder

Current generator returns an error page if construction fails.

For interactive single generation this is useful.

But in:

```text
Build a Book
```

an internal construction failure should:

```text
retry automatically
```

before creating a visible error page.

Book export must never contain:

> Unable to generate crossword.

Preflight must block it.

---

# 44. Standard Crossword Numbering

Keep existing standard numbering:

```text
left → right
top → bottom
```

A cell starting both:

```text
Across
and
Down
```

uses one clue number.

Current implementation already follows this correctly.

Do not customize numbering for Retirement version.

---

# 45. Puzzle Page Layout

Recommended default:

```text
8.5 × 11"
Portrait
Black & White
No Bleed
Large Print
```

Layout:

```text
┌────────────────────────────┐
│       TRAVEL DREAMS        │
│          Puzzle 8          │
│                            │
│ Fill in the grid...        │
│                            │
│        CROSSWORD           │
│           GRID             │
│                            │
│ ACROSS           DOWN      │
│ 1. ........      2. ...... │
│ 4. ........      3. ...... │
│ 6. ........      5. ...... │
│                            │
└────────────────────────────┘
```

---

# 46. Large-Print Clue Font

This needs changing.

Current clue renderer may shrink clue text to:

```text
8 pt
```

to force everything onto the page.

Do NOT allow that in Large Print Retirement mode.

Product standard:

```text
Puzzle title:
24–28 pt

Instruction:
13–15 pt

ACROSS / DOWN heading:
14–16 pt bold

Clues:
12–14 pt

Clue number:
12–14 pt

Grid letters on answer key:
14–18 pt

Grid clue numbers:
8–10 pt when cells permit
```

Hard minimum for Large Print clues:

```text
12 pt
```

If content cannot fit:

```text
reduce answer count
```

not:

```text
shrink to 8 pt
```

KDP's technical minimum font size is 7 pt, but Retirement Activity Prints should use a substantially higher readability standard.

---

# 47. Clue Overflow Strategy

If clue band does not fit at 12 pt:

```text
1. compress vertical clue gaps slightly
2. rebalance Across / Down column widths
3. prefer shorter valid clue variants
4. remove lowest-quality placed candidate
5. rebuild with one fewer answer
```

Never:

```text
shrink below product minimum
drop a clue
clip a clue
```

---

# 48. AI Short-Clue Rewrite

If puzzle has a good answer but clue is too long:

Do not discard immediately.

Call:

```text
rewriteClueShorter()
```

Prompt:

```text
Rewrite this crossword clue to 55 characters
or fewer.

Preserve the exact intended answer.
Do not include or reveal the answer.
Keep it clear and natural.
```

Then revalidate.

---

# 49. Instruction Copy

## Relaxed

> Solve each clue and fill the answers into the crossword grid.

## Classic

> Solve the Across and Down clues to complete the crossword.

## Challenge

Same instruction.

Difficulty should be communicated by label, not unnecessarily verbose instructions.

---

# 50. Answer Key

Keep current behavior:

* same lattice;
* clue numbers remain;
* answers filled;
* no Across/Down clue lists.

Current answer-key implementation already removes clue lists and centers the filled grid.

This is good.

---

# 51. Book Answer Structure

For finished book:

```text
PUZZLES

Puzzle 1
Puzzle 2
Puzzle 3
...
Puzzle 50


ANSWER KEYS

Solution 1
Solution 2
Solution 3
...
Solution 50
```

Do not default to:

```text
Puzzle 1
Solution 1
Puzzle 2
Solution 2
```

because solution exposure hurts the reading experience.

---

# 52. Book-Level Variety

Track:

```ts
{
  theme,
  answers,
  normalizedAnswers,
  clues,
  gridHash,
  seed
}
```

AI generation receives:

```text
recent answers
recent clues
recent theme angles
```

as avoid context.

---

# 53. Answer Repetition

Recommended:

Across adjacent puzzles:

```text
answer-set Jaccard similarity <= 0.30
```

And:

```text
no exact answer set repeated
```

For common retirement words like:

```text
TRAVEL
RELAX
HOBBY
GARDEN
```

allow reuse across a large book, but not repeatedly on nearby pages.

---

# 54. Clue Repetition

Also track normalized clues.

Bad:

```text
Puzzle 4:
GARDEN — Place where flowers grow

Puzzle 7:
GARDEN — Place where flowers grow
```

If an answer repeats later:

```text
generate a fresh clue angle
```

provided the clue remains accurate.

---

# 55. Puzzle Fingerprint

Create:

```ts
puzzleHash = hash(
  sortedAnswers
  + normalizedClues
  + normalizedGrid
)
```

No duplicate fingerprint in one project.

Also maintain:

```text
answerSetHash
gridHash
```

---

# 56. Balanced Theme Mix

For Build-a-Book:

```text
Balanced Retirement Mix
Travel & Adventure
Hobbies & Leisure
Career & Farewell
Nostalgia
Friends & Family
Custom Mix
```

Balanced example:

```text
Retirement Life       20%
Travel & Adventure    20%
Hobbies & Leisure     20%
Career & Farewell     10%
Nostalgia             10%
Friends & Family      10%
Home / Active Life    10%
```

Do not generate 50 crosswords called:

```text
Retirement
```

with slightly different words.

---

# 57. KDP Safe Area

Use project-level page count to calculate gutter.

KDP currently requires minimum inside margins based on page count:

```text
24–150 pages:
0.375"

151–300:
0.5"

301–500:
0.625"

501–700:
0.75"

701–828:
0.875"
```

For no-bleed interiors, outside minimum is 0.25".

Retirement Activity Prints should be more conservative:

```ts
topSafe = 0.50
bottomSafe = 0.50
outsideSafe = 0.50

insideSafe =
  max(
    0.50,
    kdpRequiredInsideMargin(pageCount)
  )
```

Entire crossword and clue lists stay inside this safe box.

---

# 58. Default No Bleed

Crossword itself has no reason to touch the page edge.

Default:

```text
No Bleed
```

If entire book uses bleed for other activity pages, project dimensions follow KDP bleed rules. KDP requires bleed interiors to add 0.125" to width and 0.25" to height, with artwork extending into the bleed area.

Crossword content itself still remains inside trim-safe margins.

---

# 59. Export

Preferred:

```text
Print-ready PDF
```

Keep:

```text
grid lines
clue numbers
text
answers
```

as vector objects wherever possible.

If raster content exists:

```text
effective resolution >= 300 DPI
```

Fonts must be embedded. KDP currently requires images of at least 300 DPI and specifies that interior fonts should be embedded.

---

# 60. AI Content Tracking

Every Retirement Crossword is AI-generated content by design.

Store:

```ts
interface CrosswordGenerationAudit {
  puzzleId: string

  contentSource: 'ai'

  category: string
  theme: string
  difficulty: string

  generatedCandidates: RetirementCrosswordPair[]
  approvedCandidates: RetirementCrosswordPair[]
  placedAnswers: string[]

  seed: number
  generatedAt: string

  modelVersion?: string
}
```

Project:

```ts
projectCompliance.aiGeneratedText = true
```

Amazon currently requires publishers to disclose AI-generated text when publishing or republishing through KDP; AI-assisted content is treated differently.

Show user:

> AI-generated text is used in this project. Review and answer Amazon KDP's current AI-content disclosure questions accurately when publishing.

Never display:

```text
KDP Safe
No disclosure needed
Guaranteed approval
```

---

# 61. Retirement Crossword KDP Preflight

Before export:

```text
CROSSWORD VALIDATION

✓ Every clue has exactly one intended answer
✓ Every placed answer has a clue
✓ Every clue number exists
✓ Across numbering correct
✓ Down numbering correct
✓ Crossings agree
✓ All white cells connected
✓ No illegal touching
✓ No clipped grid
✓ No clipped clue text
✓ Clue font meet
```
