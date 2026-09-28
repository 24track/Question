# TODO

Known gaps and things we want to revisit — not urgent, not forgotten.

- **Decide how, or if, to support multiple user scenarios** — e.g. separate
  Work / Personal / Hobbies data that don't mix. Ruled out: separate signed
  macOS installers per scenario (too much packaging/distribution overhead
  for one person to maintain). Still open: an in-app workspace/profile
  switcher (one install, pick which data folder is "active"), vs. something
  simpler, vs. not bothering. `main.cjs`'s `DATA_DIR` now reads an optional
  `QUESTION_DATA_DIR` env var override (unset = today's unchanged behavior,
  fixed `Documents/Question Data`) so this isn't blocked on a bigger
  refactor later — but nothing in the app exposes or sets it yet.
  - **Current workaround: swap folders by name.** Users can maintain
    separate Request databases by prepending topic names to the start of the
    `Question Data` folder. The app only recognises folders with that exact
    name; if the folder is renamed (e.g. `Personal Question Data`), the app
    won't open it.

    This means you can have multiple `Question Data` folders on your machine
    and swap between them by removing the prepended topic when you want to
    open a specific database.

    If there is no `Question Data` folder, the app will create a new, blank,
    `Question Data` folder on open.

- **Editable labels for other use cases (display-only)** — let a user rename
  the priority-score weight labels, "Shipped" (e.g. "Done") and "Requests"
  (e.g. "Things to do") so Question works as a general note-taking /
  organiser tool, without changing any behaviour. Feasible: labels would live
  in `settings.json` (already passed through as opaque JSON by the backend,
  so no backend or index change; add a default in `migrateState()` like
  `scoreWeights`). Status stays stored as `"shipped"`, `isShipped()` and
  `computeScoreParts()` are untouched. Suggested order, smallest to largest:
  1. **Priority score weights** — 5 labels in the weights dialog, plus the
     per-request "Why it ranks here" breakdown, which builds labels from a
     noun plus a count ("2 customers", "14 days old").
  2. **"Shipped"** — hardcoded in ~15 places beyond `STATUS_LABEL`: the
     Shipped filter dropdown, "Mark as shipped" buttons, empty states, the
     Requests-screen badge, the Trends tag, and the built-in "Shipped" view,
     whose name is stored in `settings.json`.
  3. **"Requests"** — ~128 mentions, with singular/plural built inline
     (nav tab, "+ New request", "New feature request", "No feature requests
     yet", "Raise a new request instead"), so it needs singular and plural
     fields plus capitalisation handling.

  Open questions to settle before building:
  - **Weights:** should a renamed label rename the underlying field
    everywhere (customers, questions), or only the weight in the dialog and
    breakdown? Otherwise the app calls the same thing two different names.
  - **Shipped:** one label plus a derived verb ("Mark as done"), or separate
    state and action labels? "Tasks" is a noun but "Shipped" is a state, so a
    state word like "Done" fits more naturally.
  - **Requests:** stay purely cosmetic (the entry box still expects "raise a
    feature request", per `isRequestIntent()`), or should the typed phrase
    follow the label? The second is new behaviour.
  - **Trends callout:** the "shipped but people are still asking… probably
    hard to find, not missing" wording is product-specific. Keep it as is,
    even where it reads oddly after a rename?
