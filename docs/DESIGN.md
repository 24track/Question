# Design choices

A running log of deliberate tradeoffs in this project — the *why* behind a
decision, not just the *what*. The point is to stop a reasonable-looking
"fix" from quietly undoing something that was intentional. Add an entry
here whenever a non-obvious choice gets made, or gets questioned and kept.

## Matching & suggestions

- **Question matching is keyword overlap, not semantic/AI.** `findAnswer()`
  stems the typed text and counts shared words against each request's
  title + description (and past answered questions). It only finds things
  that share actual vocabulary with what you typed — paraphrases and
  synonyms won't match. See the README's "How question matching works" for
  worked examples. Going semantic (embeddings/LLM) is a real option later,
  not a rejected one — this is just where it started, because it's fully
  local, deterministic, and easy to reason about.
- **Topic name is deliberately excluded from the match haystack.** Several
  requests can share one topic, so if the topic word alone counted, a
  question merely containing that word would arbitrarily "win" a match
  against one of them — a false positive when the honest answer is "here
  are all of them." That case is handled instead by the exact topic/customer
  lookup (below), not by the fuzzy match.
- **Entity lookup (typing a bare customer or topic name) matches a curated,
  finite vocabulary, not free-text search.** It only fires against names and
  tag values that actually appear on requests, so a coincidental word
  inside some unrelated description can't trigger it.
- **Topic suggestion learns vocabulary from requests already tagged with
  that topic, not a fixed keyword dictionary.** A fixed dictionary only ever
  covers the topics it was written for (an early prototype's demo content);
  learning from what's actually tagged means it works for any topic,
  built-in or user-created — at the cost of not being able to suggest a
  topic that has nothing tagged under it yet.
- **Question-clustering's join threshold scales down for short questions.**
  `clusterUnmatchedQuestions()` used a fixed "needs 2+ shared stemmed words
  to join a cluster" rule, which meant a one-word unmatched question (or,
  really, any two questions whose only shared vocabulary was ever going to
  be one word) could never cluster with anything — not even an exact repeat
  of itself, since a single word can never reach an overlap of 2. Fixed to
  `min(2, thatQuestion'sWordCount)`: still needs 2 shared words once there
  are 2+ to compare (so one coincidental shared word between unrelated
  questions doesn't falsely cluster them), but a 1-word question only needs
  that word to match. A question that stems to zero words (all stopwords)
  never joins anything — there's no real content there to compare.
- **A single unmatched question that never clusters with another, and never
  becomes a feature request, has no dedicated view.** This is deliberate,
  not an oversight: the current design only surfaces unmatched questions
  once two or more of them share wording (an actual recurring theme, in
  "Recurring themes without a tracked feature yet"). A list of every
  one-off unmatched question would very likely turn into an
  always-growing, never-emptied backlog — nobody acts on a single stray
  question, so it just sits there, and a backlog nobody clears kills
  motivation to look at it at all. If someone genuinely needs something,
  the existing path (raise it as a feature request directly) already
  covers that. The data isn't lost either way — every question, matched or
  not, is already in `state.questions` on disk — so this can be revisited
  later without any data migration if it turns out to matter in practice.

## Data & persistence

- **Markdown files with YAML frontmatter, under `data/`, are the real
  source of truth.** Human-readable, yours to back up/sync/edit/put in your
  own git repo — not locked into this app.
- **The SQLite index (`data/index.sqlite`) is disposable.** It's rebuilt
  from the Markdown files on every save, purely to make the cross-data
  Trends queries fast. Delete it and it comes back with nothing lost —
  it's never allowed to become a second, divergent source of truth.
- **Chat feed history is in-memory only and resets on app restart.** This
  is a known, accepted limitation, not a bug: everything else (requests,
  questions, settings, view layout, feed panel height) round-trips to disk;
  the feed transcript itself deliberately doesn't.
- **Example data only ever seeds on the true first run — ever, on this
  machine — not just "no data currently on disk."** Those aren't the same
  test: deleting `Question Data` to reset the app (see the "Clear all data"
  entry below) also deletes `settings.json`, which used to be the only
  first-run signal, so it used to make the app look exactly like a fresh
  install and reseed the examples again. It now also checks a tiny marker
  file, `seeded.marker`, written on first launch — deliberately kept
  *outside* `Question Data`, in Electron's own per-user app-support
  directory (see `main.cjs`'s `SEEDED_MARKER`), specifically so it survives
  the visible data folder being deleted. This is the one deliberate
  exception to "nothing hidden in app-support" above: unlike everything
  else, this file holds no user content at all, just one bit ("has this
  app ever produced its example data before") — a reset should give you a
  truly blank app, not the demo content again.

## Views & scoring

- **A shipped request's priority score only ever climbs, never drops out of
  the way, unless something filters it out.** The score formula reads an
  overdue due date as increasingly urgent (`10 + min(20, daysOverdue)` in
  `computeScoreParts()`) — correct for an open request that's slipping, but
  a shipped request has no "slipping" left; it's just done. Rather than
  special-case "shipped" inside the score formula itself (which would make
  the formula's meaning conditional and harder to reason about), each view
  has a `shippedFilter` ("all" / "hide" / "only") applied before
  sort/group — so the formula stays one honest thing, and whether a
  finished item should even be competing for attention is a per-view
  decision instead.
- **Today and By urgency default to hiding shipped requests; All requests,
  Topic heat and By quarter default to showing everything.** The first two
  are working views — "what do I do next" — where a permanently-done item
  is just clutter (this is the bug that prompted `shippedFilter` to exist
  at all: a shipped, overdue request was sorting to the top of Today). The
  other three are read as comprehensive or historical on purpose — "Topic
  heat" in particular loses meaning if it can't show that a shipped
  feature is still generating questions, which is itself a signal (probably
  a discoverability problem, not a backlog problem).
- **A dedicated "Shipped" view (`shippedFilter: "only"`) exists so hiding
  shipped requests elsewhere doesn't mean losing track of them.** Hiding is
  a view-level display choice, never a data-level one — nothing about a
  request's shipped status affects whether it's in `state.requests`, only
  which views choose to show it.
- **Migrating an existing install only changes the one view the bug was
  actually in.** Every pre-existing view defaults `shippedFilter` to `"all"`
  (i.e., exactly what it already showed) except the score-sorted Today view,
  which defaults to `"hide"` — on the theory that fixing the reported bug
  automatically beats requiring a manual step, but silently changing what a
  *different*, working view already shows out from under an existing user
  does not. The new Shipped view is also added automatically on migration,
  so upgrading doesn't just make shipped requests disappear.
- **Whether a request is shipped is derived from `status === "shipped"`,
  not stored as its own field.** It used to be: a `shipped` boolean, set
  only by the dedicated "Mark as shipped" button. But the generic Status
  dropdown could independently set `status` to `"shipped"` without ever
  touching that boolean, so the two could desync — the exact reported bug:
  a request set to "Shipped" via the dropdown kept scoring and appearing as
  if it were still open, because `shippedFilter` only checked the boolean,
  until someone also clicked "Mark as shipped" to bring it in sync. Rather
  than keep two things in sync by hand, `status` is now the single source
  of truth and `isShipped(r)` (`r.status === "shipped"`) is computed
  wherever shipped-ness is checked — there's no second field left to drift.
  `migrateState()` strips the legacy `shipped` field from in-memory state on
  load (mirroring how `tags`/`segment` are already retired), and the SQLite
  index's `shipped` column is likewise computed from `status` when the index
  is rebuilt, so a stale value in an old on-disk file can't linger there
  either.

- **Shipped requests show a plain due date — never "overdue", never red.**
  This is the display-side counterpart to the score entries above. A shipped
  request's score is deliberately left alone (it can still carry overdue
  points), but a finished item has nothing left to be late for, so the
  request detail panel, request rows, matched-request card and the "Why it
  ranks here" breakdown show just the date (e.g. "Sept 29"; "Due Sept 29" in
  the breakdown) in neutral text. `dueLabelFor(r)` and `isDueSoon(r)` are
  where this is decided (`isDueSoon` is false for anything shipped), so the
  rule lives in one place. Don't "fix" the mismatch between a shipped
  request's neutral label and its non-zero overdue score points — it's
  intentional: the formula stays one honest thing, and what to show is a
  presentation decision.
- **Due dates are calendar dates, compared by local calendar day — not
  instants.** A due date is stored as the timestamp of local midnight on the
  chosen day, but it means "that day", not "that moment". `daysUntil()`
  therefore compares the due date's local day with today's local day
  (`Math.round` absorbs the 23/25-hour days around daylight-saving changes),
  so a request due today reads "due today" from midnight to 23:59 and is
  only "1d overdue" from the next day. The earlier version compared the
  timestamp against the current time, which made anything due today read
  "1d overdue" after midnight-relative rounding (and "0d overdue" or "due in
  0d" at other times of day), and also scored it as overdue. The date picker
  is filled from local date parts (`dateInputValue()`), because
  `toISOString()` converts to UTC and showed the previous day in timezones
  ahead of UTC. **Known limit, deliberately not handled:** because the value
  is a local-midnight timestamp, moving the data between timezones (travel,
  or syncing the `Question Data` folder across machines) can shift a due
  date by a day. Storing a plain `YYYY-MM-DD` string instead would fix that
  (with a one-off migration of existing timestamps); it wasn't done because
  cross-timezone use isn't expected for now.

## UI & renderer

- **"Unscheduled" is always offered in a request's Quarter dropdown, even
  when no request currently uses it.** The dropdown is built from quarters
  already in use (`knownQuarters()`), so once the last unscheduled request
  was given a real quarter, "Unscheduled" vanished and a request could never
  be moved back. It's now a fixed option, like Status's built-in values.
  Deliberately *not* a "None" option that stores an empty value: the quarter
  grouping already treats an empty quarter as "Unscheduled", but
  `matchQuarterQuery()` only recognises "Unscheduled" when a request
  literally carries that value, so an empty quarter would make "show me
  Unscheduled" find nothing.

- **A matched question no longer counts itself automatically — the person
  has to click "Count this ask" / "Link this question" on the Answer
  screen.** Before the "what should I work on now?" redesign, `handleEntry()`
  bumped `questionCount` and set `matchedRequestId` the instant a match was
  found, with no way to undo it beyond raising a whole new request. The
  Answer screen's match state (see handover README, "Answer cards / State
  A") shows the request's *current* customer list and rank, and the effect
  of counting this ask ("Its rank goes from #x to #y") as a preview *before*
  it happens — which only makes sense if the click is the thing that
  actually applies it. The question is still logged immediately either way
  (nothing is lost if the tab is closed without clicking); only the link to
  the request, the customer addition, and the `questionCount` increment
  wait for the explicit action.
- **Quarter is looked up the same way as customer and topic — a curated,
  finite vocabulary, never free text.** `matchQuarterQuery()` only fires on
  the literal words "quarter"/"quarters"/"this quarter", or a quarter value
  that already exists on a request (e.g. "Q4", "Q3 2026", "Unscheduled").
  Same reasoning as the existing customer/topic lookup in "Matching &
  suggestions" above: it can't be tricked into "finding" a quarter nobody's
  using.
- **Quarter card order is real-quarters-first, undated-last — the opposite
  of `knownQuarters()`'s own sort.** `knownQuarters()` sorts ascending by
  `parseQuarterSort()`, which gives "Unscheduled" (and anything else that
  doesn't parse as "Q<n> YYYY") a sentinel value of `-1` so it sorts first —
  fine for that function's own purpose, wrong for a person reading a
  quarter board, where the undated bucket reads as a trailing "everything
  else," not the most urgent item on the page. Both the quarter answer
  screen and the Requests screen's "group by quarter" re-partition on
  `parseQuarterSort(k) >= 0` before sorting, rather than changing
  `knownQuarters()` itself (other callers, like the Quarter dropdown in the
  request modal, still want ascending-with-undated-first-or-wherever order
  and shouldn't be affected by a UI-only display preference).

- **There is no "Clear all data" button.** There used to be one — a
  permanent, always-visible, one-click, unrecoverable wipe in the main
  header. It got removed rather than hidden behind a confirmation step or a
  keyboard shortcut: there's no realistic scenario where you'd want to wipe
  your actual content while keeping your views/topics/statuses set up
  around it (the one thing the button did that a full reset can't), so it
  wasn't pulling its weight against the risk of a misclick once real data
  is in the app. Quitting and deleting the `Question Data` folder (see
  "Running it" in the README) does the same job — and more safely, since
  it requires a deliberate action outside the app and typically goes
  through the OS Trash/Recycle Bin first, rather than a hard delete inside
  the app itself.
- **Single-file HTML/CSS/JS renderer, no framework, no build step.** Keeps
  the whole UI inspectable and editable directly; a build step or framework
  would be a real cost for a UI this size.
- **The feed panel's height is user-resizable (drag the divider above the
  composer) and persisted per install**, rather than a fixed `vh` value —
  the "right" split depends on window size and how someone actually uses
  the conversation panel, so it's a preference, not a constant.

## Security

- **Electron shell runs with `contextIsolation` on, `nodeIntegration` off, a
  sandboxed renderer, and a CSP enforced in both the page and the main
  process.** The renderer only ever crosses the bridge via two calls —
  `loadAll()` and `syncAll(...)` — everything else (parsing frontmatter,
  writing files, rebuilding the index) stays in the main process, off
  limits to whatever runs in the renderer.
