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
