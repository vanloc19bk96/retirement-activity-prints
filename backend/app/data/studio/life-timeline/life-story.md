Write {needed} open-ended reflection prompts about {stage}, for one page of a
large-print keepsake life story book. An older adult answers each prompt by
hand, in their own book, a life stage at a time, for their family to keep.

Tone: {tone}. Seed for variety: {seed}.
What this stage is made of: {stage_hint}.

EVERY PROMPT MUST:
- Be ONE short question about the reader's OWN life and memories.
- Ask for one particular scene, person, place, object or habit — never for a
  summary of the whole stage, and never for a view on life in general.
- Name something concrete the reader can picture: a room, a route, a meal, a
  smell, a sound, a piece of clothing, a chore, a game, a tool, a song on the radio.
- Be answerable in two handwritten lines, yet still worth writing a page about.
- Name ONE thing, not a choice of things: no "the kitchen or the main room", no
  "a toy or a game". Pick the one that belongs to this stage and ask about it.
- Read like something you would say out loud to the person sitting opposite you.
- Have no right answer and test nothing — the reader must never feel caught out.
- Fit any reader of this stage: assume nothing about who or what they had, and
  ask in a way that works whoever was there and wherever they lived.
- Stay under {max_len} characters so it fits the printed line.
{locale_line}

THE SET OF {needed} MUST:
- Give every prompt a different angle. Take angles from this list, use each at
  most once, and never use the same angle twice in a row:
  - a person who was around every day — what they said, wore, or always did
  - a room, a corner or a view they knew by heart
  - what an ordinary day looked like, first thing in the morning or last thing at night
  - a smell, a sound or a taste that belonged to those years
  - an object they owned, borrowed, mended or kept
  - food — what was cooked, shared, queued for, or saved for special days
  - one particular day: a first time, an arrival, an outing, a surprise
  - what they did with free time when nobody had organised anything
  - a job, a chore or a knack they picked up, and who showed them how
  - how they got about — the route, the vehicle, the weather on the way
  - words: a saying, a nickname, a programme or a tune that was always on
  - what they wore, carried in their pockets, or spent their own money on
- Move forward in time down the page: earliest first, latest last.
- Vary the opening word — no more than two prompts may begin with the same word.
- Use "favourite", "best" or "most" in at most ONE prompt in the set.

UNMISTAKABLY THIS STAGE — the hardest part, and where prompts usually fail:
- What makes a memory belong here: {stage_lens}.
- Test every prompt on its own, with the page heading covered up. If it could be
  printed word for word under a different life stage, it is not finished: rewrite
  it until only this stage can answer it.
- Do that by placing it in time, by asking about something only this stage did,
  or both. Vary how you place it in time — these phrases and their natural
  equivalents, rather than the heading repeated over and over: {stage_anchors}.
- At most TWO prompts may carry the same time-anchoring phrase.

TOO GENERIC — never write anything like these:
- "What is your favourite memory from this time?" (asks for a summary)
- "What did you enjoy doing back then?" (nothing concrete in it)
- "Who were the important people to you?" (true of every stage)
- "What did the main room smell like in the morning?" (concrete, but any stage
  could answer it — this is the failure to watch for)

SPECIFIC ENOUGH — this is the level wanted. The examples are anchored to
childhood; anchor your own to {stage} the same way, and never copy the wording:
- "When you were small, who was up before you, and what did they do first?"
- "What did the walk home from school smell like on a wet afternoon?"
- "Which job around the house did you always try to get out of as a child?"
- "What did you carry home in your pockets from playing out?"

MUST NOT ask about:
{avoid_topics}

Every prompt is an open question and MUST end with a question mark.
Return {needed} DISTINCT prompts in "prompts" — no two may ask the same thing.
