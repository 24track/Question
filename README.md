# Question

A lightweight desktop tool for product managers to keep feature requests and
customer questions in one ledger: track who's asking for what, spot
duplicate asks before they become duplicate work, see which topics keep
coming up, and know what to work on next.

<p>
  <img src="docs/screenshots/today-dark.png" alt="Today view, dark theme" width="49%">
  <img src="docs/screenshots/today-light.png" alt="Today view, light theme" width="49%">
</p>

The **Today** view above: every open request ranked by a single adjustable
priority score, blending urgency, how many customers asked, how many
questions came in, age, and due-date proximity.

## What it does

- **Today view** — a single, adjustable priority score (urgency, customer
  count, question volume, age, due-date proximity) surfaces what to work on
  next, instead of a flat backlog.
- **Feature requests** — track status, urgency, topic, quarter, customers,
  and due date per request; raise a request straight from a logged question
  so duplicates get merged instead of re-created.
- **Questions** — log customer questions, match them to an existing request
  or leave them unmatched, and see which topics have unanswered questions
  piling up.
- **Trends** — cross-cutting views across requests and questions: topic
  heat, recurring themes without a tracked feature yet, customers by
  request count, and quarter-over-quarter shape.
- **Custom statuses & topics** — rename or delete the values you added,
  the same way for both.
- **Light / dark / system theme.**

## How it's built

- **Renderer**: a single-file HTML/CSS/JS UI (`renderer/index.html`), no
  framework, no build step.
- **Backend**: plain Node.js (`src/backend.cjs`). Every request and question
  is a human-readable Markdown file with YAML frontmatter under `data/` —
  that's the actual source of truth, and it's yours: back it up, sync it,
  read it in a text editor, put it in your own git repo if you want.
- **Index**: a SQLite file (`data/index.sqlite`, via Node's built-in
  `node:sqlite`) is rebuilt from those Markdown files on every save. It's
  disposable — delete it and it comes back from the files alone, with
  nothing lost. This is what makes the cross-data Trends queries fast
  without turning the Markdown files into a "real" database you have to
  migrate.
- **Desktop shell**: Electron (`main.cjs` / `preload.cjs`), with
  `contextIsolation` on, `nodeIntegration` off, a sandboxed renderer, and a
  `contentSecurityPolicy` enforced both in the page and in the main
  process. The renderer only ever gets two calls across the bridge —
  `loadAll()` and `syncAll(...)` — everything else (parsing frontmatter,
  writing files, rebuilding the index) stays in the main process.

Your data lives in `~/Documents/Question Data` so you can find, back up, or
inspect it directly, outside any app-specific hidden folder.

## Running it

```
npm install
npm start
```

`npm run demo` runs a small end-to-end proof of the backend on its own
(seeds sample data, deletes the index, rebuilds it from the Markdown files,
and runs a few sample SQL queries against it) without needing Electron.

## Building installers

```
npm run dist
```

Uses `electron-builder` to produce an installer for whichever platform
you're running it on, in `release/` (electron-builder doesn't reliably
cross-build a mac installer from Windows or Linux, or vice versa). Tagged
pushes to this repo build all three — `.dmg` (mac), an NSIS installer
(Windows), and an AppImage (Linux) — automatically via GitHub Actions,
one platform per runner, and attach them to a GitHub Release — see
`.github/workflows/build.yml`.

## Status

Early and actively changing. Feedback from real use is exactly what shaped
most of what's here so far — bug reports and rough edges are welcome.

## License

MIT — see [LICENSE](LICENSE).
