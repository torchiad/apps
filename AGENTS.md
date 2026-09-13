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
npm run build      # outputs to dist/
npm run preview    # preview the production build
npm run lint       # ESLint over the whole repo
npm run test:e2e   # Playwright: builds, serves, loads every app, checks for JS errors
```

Validate changes with `npm run lint`, `npm run build`, and `npm run test:e2e`
before opening a PR — these three are also what CI runs (see below), so a
green local run should mean a green PR. If you touched any `.json` file,
also confirm it parses: `node -e "JSON.parse(require('fs').readFileSync('path/to/file.json'))"`.

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

- Run `npm run lint`, `npm run build`, and `npm run test:e2e` and confirm all
  three succeed.
- If you touched any `meta.json`, confirm it's valid JSON and lives inside an
  app folder, not the repo root.
- If you added an app, confirm all three of `vite.config.js`, `index.js`
  (`PROJECTS`), and the new folder are in the same commit — one without the
  others leaves the repo in a broken state. Also add it to the `APPS` list in
  `tests/smoke.spec.js` so the visual verifier covers it.

## PRs

Keep PRs scoped to one app or one concern. Describe what changed and, for a
new app, note the entry was added to `vite.config.js` and `index.js` as
described above.

## The task board

Work for agents is tracked as GitHub issues on this repo, labeled:

- `ready-for-agent` — well-specified enough (acceptance criteria + rough test
  plan in the issue body) for an agent to pick up unattended.
- `in-progress` — an agent has claimed it and is working in a branch/worktree
  named after the issue (e.g. `agent/issue-123`).
- `needs-human` — an agent got stuck, hit an ambiguous design decision, or
  exhausted its retry budget; a person needs to look at it.

An issue without `ready-for-agent` is not a green light to start unattended
work on it — treat it as still being scoped, and ask rather than guess at
missing acceptance criteria.

## Quality gates (what actually blocks a merge)

Every PR must pass, in this order:

1. **Lint** — `npm run lint` (ESLint, `eslint.config.js`).
2. **Build** — `npm run build`.
3. **Visual verification** — `npm run test:e2e` (Playwright: loads every
   app's real built page in a browser and fails on any uncaught JS
   exception or `console.error`; network failures from third-party
   resources like fonts/map tiles/RSS feeds are treated as noise, not
   signal, since the CI runner has no general internet access).
4. **Claude code + security review** (`.github/workflows/claude-review.yml`)
   — an automated pass for correctness bugs and OWASP-Top-10-style
   security issues. It fails the check on any finding it labels BLOCKING;
   optional/style findings never fail the check.
5. **Secret scan** (`.github/workflows/gitleaks.yml`) — fails if the diff
   introduces anything that looks like a committed credential.

All of the above are enforced as required GitHub status checks in this
repo's branch protection. There is no "merge anyway" for a red check.
Dependabot (`.github/dependabot.yml`) additionally opens PRs for vulnerable
or outdated dependencies, which go through the same gates as any other PR.

## Overseer / auto-merge policy

Tasks dispatched from the board are driven by an overseer process, not a
human clicking merge for each one: once all quality gates above are
green on a PR, it is merged automatically and its branch/worktree is deleted.
This makes the gates above the *entire* safety net for what lands in `main`
— when adding or changing a gate, assume nothing else will catch what it
misses.

Consequences of that for anyone (human or agent) working in this repo:

- Never weaken a gate (skip a test, silence a lint rule, narrow what the
  Playwright smoke test checks) to get a PR green. Fix the underlying
  issue, or if the gate itself is wrong, say so explicitly in the PR
  description rather than quietly routing around it.
- A worker that can't get its own PR green after a couple of honest retries
  should label the issue `needs-human` and stop, rather than keep pushing
  speculative fixes against an auto-merge gate.
- One task = one worktree/branch, never shared between concurrent tasks.
  Delete it after merge (success) or hand-off to a human (`needs-human`) —
  don't leave stale branches around.
