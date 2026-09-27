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

## UI & renderer

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
