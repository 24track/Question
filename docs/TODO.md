# TODO

Known gaps and things we want to revisit — not urgent, not forgotten.

_Multiple data sets are done: see "Desks" in docs/DESIGN.md._

- **Terminology (later)** — consider renaming "Request" to "Task" and
  "Customer" to "People". Both terms come from product management and don't
  fit other uses well, such as daily tasks or home projects, which desks now
  make easy to set up. Keep the current terms for now and revisit if the app
  gets wider use. It's a wording change only: behaviour stays the same. (This
  overlaps with the editable-labels item below.)

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

- **Answer-card customer picker (maybe later)** — on the ask-box answer card
  for a matched request, the customer tag is display-only. It shows the
  customer parsed from the question text, resolved through the alias list,
  and "Count this ask" adds that name. Making the tag a chip input, like the
  one in the request modal, would let someone pick or correct the customer
  before counting the ask, and would show "NEW" for a name nobody has used.
  Left out of the customer-name work on purpose: parsing plus the shared
  resolver already keeps the spelling consistent, and the picker adds UI to
  the most-used screen. Revisit if people count asks under the wrong customer.

- **Uninstalling (README section, after the next build is tested)** — dragging
  the app to the Bin leaves everything else behind, and macOS gives an app no
  hook to clean up after itself, so this is documentation, not code. Add an
  "Uninstalling" section to the README saying:
  - Your data lives in `Documents/Question`. Keep it if you might come back;
    delete it by hand if you want it gone. The app never removes it for you,
    on purpose.
  - The app also keeps a tiny settings folder (just the last-opened desk
    name) under `~/Library/Application Support`, and Electron may leave small
    cache and preference files in `~/Library/Caches` and `~/Library/Preferences`.
    None hold user data and deleting them is optional. On Linux the
    equivalent is under `~/.config`.

  Blocked on the real folder names: they haven't been checked on a Mac. After
  the next build, install it, run it once, and note exactly which
  "question"/"Question" folders and files appear in those locations, then use
  those names in the README rather than guessing. (My guess is that the
  Application Support folder is `question-app`, since that's the `name` in
  `package.json`, but it hasn't been confirmed.)
