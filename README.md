# Sundry

A shelf of standalone HTML/JS apps. No build step. Deploy anywhere static.

## Adding an app

See `AGENTS.md` for the full, accurate steps (it covers three files that all
need updating together: the new app folder, `vite.config.js`, and the
`PROJECTS` list in `index.js`). Short version:

1. Create a folder under `apps/` with `index.html`, `app.js`, `style.css`
   (and optionally a `meta.json` for reference — see `AGENTS.md`).
2. Add an entry point for it in `vite.config.js`.
3. Add a matching entry to the `PROJECTS` array in `index.js` — this is what
   actually drives the hub listing.
4. Push to `main` — GitHub Actions builds and deploys automatically.

## Running locally

Open `index.html` directly in a browser, or serve the root:
```
npx serve .
```

## Deploying

Push to GitHub, enable Pages (Settings → Pages → Source: GitHub Actions). The workflow in `.github/workflows/deploy.yml` handles everything.
