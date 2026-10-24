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
- **No example data: every desk starts empty.** The app used to seed a
  handful of example requests and questions on the very first run (guarded by
  a `seeded.marker` file in Electron's app-support directory so a reset
  wouldn't bring them back). That was dropped: a new user's first desk
  showing someone else's made-up requests doesn't make sense, and the empty
  Now screen already says what to do next. The marker and the seed data are
  gone from the code; a stray `seeded.marker` left in app-support by an
  earlier version is harmless and never read. The example set lives on as a
  development tool, `node tools/sample-desk.cjs [outDir]`, which writes it out
  as a real desk (dates relative to now) for trying screens and ideas against
  realistic data; it isn't part of the packaged app. `npm run demo` still seeds
  its own throwaway sample data for the backend proof.

- **Desks: one folder per separate set of data, switched by pointing the
  app at a different folder.** There's no database to migrate and no
  connection to manage, because the Markdown files are the source of truth and
  the SQLite index is rebuilt from them on every save (so nothing is held
  open between saves, and renaming the open desk's folder is safe). The
  choices that aren't obvious from the code (`src/desks.cjs`, `main.cjs`):
  - **A desk is recognised by its structure, not a marker file.** A subfolder
    of `Documents/Question` counts when it has the app's own
    `feature-requests` and `questions` folders. Anything else the user keeps
    there is never listed or counted, and a folder moved in by hand from an
    older version just appears.
  - **The last-opened desk is remembered in `desks.json`, in Electron's
    app-support directory**, not in a desk folder or
    in `Documents/Question`, so renaming or deleting a desk by hand never takes
    the setting with it.
  - **Switching reloads the page.** Chat history, saved-view state and open
    dialogs reset exactly as they do on restart; nothing is persisted per desk
    (chat history is in-memory only, see above).
  - **A missing folder falls back to the picker; it's never recreated.** The
    folder is checked before every save and every switch. If the open desk's
    folder was deleted or renamed by hand, that save is dropped (there's
    nowhere to put it) and the app shows the picker with a "couldn't find"
    message. Silently recreating the folder would hide the problem and fork
    the person's data.
  - **No delete in the app.** Removing a desk means deleting its folder by
    hand, the same deliberate friction as the missing "Clear all data" button.
    Rename only ever applies to the open desk and renames its folder.
  - **The renderer never sends a path.** It names a desk; the main process
    resolves it under the parent folder. Names are checked there (empty, the
    characters Windows forbids, Windows-reserved names, trailing dots,
    duplicates ignoring case, an existing non-desk folder in the way).
  - **All the UI wording lives in `DESK_COPY` in `renderer/index.html`,** so
    the word "desk" is easy to change later.

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
- **Now and By urgency default to hiding shipped requests; All requests,
  Topic heat and By quarter default to showing everything.** The first two
  are working views — "what do I do next" — where a permanently-done item
  is just clutter (this is the bug that prompted `shippedFilter` to exist
  at all: a shipped, overdue request was sorting to the top of Now). The
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
  (i.e., exactly what it already showed) except the score-sorted Now view,
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
  or syncing a desk folder across machines) can shift a due
  date by a day. Storing a plain `YYYY-MM-DD` string instead would fix that
  (with a one-off migration of existing timestamps); it wasn't done because
  cross-timezone use isn't expected for now.

- **A saved view can carry a filter (one customer, topic or quarter).**
  "Save as view" on a customer/topic/quarter answer page used to save only
  Group by / Layout / Shipped, so the saved view didn't show what the page
  had. A view now also stores `filter: { type, value }`, and loading it shows
  the Requests screen narrowed to that, with a chip (✕ to clear) above the
  list. Views saved from the answer page use "Shipped: included", since the
  answer page lists shipped requests too. The "all quarters" answer has no
  single value to filter on, so it saves no filter. A customer filter goes
  through `requestsForCustomer()`, so it survives a rename or merge. Views
  saved before this simply have no filter.

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
  is in the app. Quitting and deleting a desk's folder (see
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

## Customers

- **Customers are free text, so one shared chip input (`createCustomerInput()`)
  is used everywhere a customer is entered — the new-request dialog and the
  request modal — to show whether a name already exists while you type.**
  Before it, customers were a comma-separated field and a bare "+ Add" box,
  so there was no way to see existing names, and near-duplicates ("Acme" /
  "acme" / "Acme Ltd") piled up. The dropdown is driven by
  `customerSuggestions()`, in this priority order: same name ignoring
  case/spacing (highlights the existing spelling, no "Add" row); the typed text
  appearing anywhere in an existing name; a likely typo or variant ("Did you
  mean…", "Add" needs Shift+Enter or a click); genuinely new.
- **Suggestions never merge anything by themselves, and what counts as
  "similar" is deliberately narrow.** "Acme", "Acme Financial" and "Acme
  Loans" can all be genuinely different customers, so only a trailing company
  suffix (Ltd, Inc, Co, LLC…) or punctuation counts as a variant, plus a
  small typo margin: names must be at least 5 letters, and are 1 letter apart
  up to 7 letters or 2 apart from 8. That is tighter than "within 1–2 letters"
  in the handoff README, on purpose — on short names a 2-letter margin
  false-matches ("Acme" vs "Acne"). A wrongly suggested customer is a
  mistake the person has to notice; a missed suggestion just means a new
  customer, which the merge step (below) can clean up later.
- **Typed text is never silently lost.** Comma, clicking away and saving the
  request all commit whatever is typed, taken literally — using the existing
  spelling if it matches one ignoring case, otherwise as a new customer,
  marked NEW (dashed chip) until the request is saved. Enter, by contrast,
  picks the highlighted suggestion. The request modal autosaves and
  re-renders after each change, so it re-focuses the input afterwards, except
  when the change came from clicking away.
- **Requests → Group by Customer lists a request under every one of its
  customers, so group counts deliberately add up to more than the number of
  requests.** One row per customer-request pair is the only way to answer
  "what has Halden asked for?" from a grouped list. The footer note only says
  so when some request really is listed twice. Groups run biggest customer
  first, then A–Z, with requests that have no customer in a last "No
  customer" group (dashed rule). Counts follow the existing Shipped filter,
  like every other grouping, so they match what's on screen. The second line
  of each row names the request's *other* customers ("also …") or "only …",
  since the group header already says which customer it's under. The
  "may be the same customer" hint reuses the dropdown's similarity rule
  (`customerSimilarity()`) and shows only on the customer with more requests
  (ties: the alphabetically first), so a pair is flagged once, not twice.
  Its "Merge" link (opens the dialog below with the similar customers ticked)
  and each header's "Edit" link sit on the right of the header.
- **Rename and merge are one dialog ("Edit customer"), and merges use a small
  alias list, not rewritten question text.** A question has no customer
  field; its customer is parsed out of its own text (`parseCustomerFromText()`).
  Merging "Acme Ltd" into "Acme" relabels the customers on requests (a request
  that had both keeps one "Acme", counted once) and records "Acme Ltd" →
  "Acme" in `settings.json` (`customerAliases`, keyed by the lowercased old
  name). A question that still says "Acme Ltd" then resolves to "Acme" in the
  ask box, the customer chip and Trends counts. The person's own words are
  never edited. A plain rename records the old name the same way, so it
  follows the person's questions too. Aliases never chain: each new merge or
  rename repoints older aliases at the final name, and renaming back drops the
  alias for the reinstated name.
- **One resolver (`resolveCustomer()`) decides which spelling a typed or parsed
  customer name becomes:** a name already on some request (ignoring case and
  spacing) first, then the alias target, then the name as typed. The chip
  input, the ask box, question parsing and "Count this ask" all go through it,
  so they can't drift apart. A name that is in use always beats an alias, and
  the dropdown's "Add as new customer" row still lets someone deliberately
  bring back a merged-away name as its own customer. `knownCustomers()` now
  lists one spelling per customer (the most-used one), and
  `parseCustomerFromText()` tries longer names first so "Acme Financial" isn't
  read as "Acme".
- **Renaming onto a name that already exists is blocked, with a Merge button
  instead.** Silently combining two customers on a rename would be easy to do
  by accident. Case-only renames ("acme" → "Acme") are allowed. The dialog
  shows what will happen before saving (new request count, and how many
  requests already had both names). The similar-customer rows use the same
  `customerSimilarity()` rule as the hint; other customers can be added by
  search, since "Acme", "Acme Financial" and "Acme Loans" can be separate
  customers on purpose. There is still no "Not the same" dismissal for the
  hint; it was considered and left out until someone finds the hint annoying.
  Merging or renaming doesn't change a request's `updatedAt`.

## Security

- **Electron shell runs with `contextIsolation` on, `nodeIntegration` off, a
  sandboxed renderer, and a CSP enforced in both the page and the main
  process.** The renderer only ever crosses the bridge via two calls —
  `loadAll()` and `syncAll(...)` — everything else (parsing frontmatter,
  writing files, rebuilding the index) stays in the main process, off
  limits to whatever runs in the renderer.
