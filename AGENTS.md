# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Jules,
etc.) working in this repository. Humans: see `README.md`.

## What this repo is

`sundry` is a static shelf of small, independent HTML/JS/CSS apps ("Shoreline",
"Hose Planner", "Kuharica", "Broadsheet", "Gnomon", ...), listed on a single
hub page (`index.html` + `index.js`) and deployed as a static site via GitHub
Pages. There is no shared framework or backend — each app is plain HTML/CSS/JS,
optionally importing a package from `dependencies` (e.g. `leaflet`,
`suncalc`) or the shared tokens in `shared/design.css`.

## Setup

```
npm install
npm run dev        # Vite dev server
npm run build       # outputs to dist/
npm run preview     # preview the production build
```

No test suite or linter is configured. Validate changes by running
`npm run build` and confirming it completes without error, and by checking
any touched `.json` files parse (`node -e "JSON.parse(require('fs').readFileSync('path/to/meta.json'))"`).

## Adding a new app — the real steps

This is the part that's easy to get wrong, because a piece of it lives in
each of three separate files. All three are required for a new app to
actually build and appear on the hub:

1. Create `your-app-name/` with `index.html`, `app.js`, and `style.css` (no
   build step inside the folder — plain script/link tags, same as the
   existing apps).
2. Add an entry point in `vite.config.js`'s `input` map:
   ```js
   your_app_name: path.resolve(__dirname, 'your-app-name/index.html'),
   ```
   Without this, `npm run build` will not emit the app and the deployed hub
   link will 404.
3. Add a matching object to the `PROJECTS` array in `index.js` (near the top
   of the file) with `slug`, `path` (`/apps/your-app-name/`), `uses: 0`,
   `hue`, `pattern`, `name`, `category`, `blurb`, and `date`. **This array is
   the actual source of the hub listing** — it is hand-maintained, not
   generated from anything.
4. Optionally add a `your-app-name/meta.json` mirroring the same fields, for
   humans skimming the folder. Some existing apps have one (`gnomon`,
   `hose-planner`, `rss-reader`), some don't (`shoreline`, `cookbook`) — it is
   not read by any build step or script, so treat it as documentation, not
   configuration. Do not rely on a `generate.js` script — it does not exist
   in this repo despite older docs mentioning one.

`hue` is an OKLCH hue (0–360) used for the tile color; `pattern` is one of
`dots | stripes | arch | grid | waves | blocks`.

**A meta.json must never be created at the repo root** — it belongs inside
the app's own folder. (A stray, corrupted root-level `meta.json` was found
and removed during cleanup of this repo — a likely case of exactly this
mistake.)

## Code style

- Plain, framework-free JS/HTML/CSS. No JSX, no build-time templating beyond
  what Vite does by default.
- 4-space indentation, semicolons, single or double quotes both appear —
  match the file you're editing.
- Prefer small template-literal string builders (see `tileGrid`/`tileList` in
  `index.js`) over adding a UI framework or templating library.
- Reuse the color/typography tokens in `shared/design.css` rather than
  hardcoding new colors when an app can plausibly share the site's look.

## Before committing

- Run `npm run build` and confirm it succeeds.
- If you touched any `meta.json`, confirm it's valid JSON and lives inside an
  app folder, not the repo root.
- If you added an app, confirm all three of `vite.config.js`, `index.js`
  (`PROJECTS`), and the new folder are in the same commit — one without the
  others leaves the repo in a broken state.

## PRs

Keep PRs scoped to one app or one concern. Describe what changed and, for a
new app, note the entry was added to `vite.config.js` and `index.js` as
described above.
