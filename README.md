# Sundry

A shelf of standalone HTML/JS apps. No build step. Deploy anywhere static.

## Adding an app

1. Create a folder under `apps/`:
   ```
   apps/your-app-name/
   ├── index.html
   ├── app.js
   ├── style.css
   └── meta.json
   ```

2. Fill in `meta.json`:
   ```json
   {
     "name": "Your App",
     "category": "Tool",
     "blurb": "One sentence describing what it does.",
     "hue": 220,
     "pattern": "dots",
     "date": "2026-06-02"
   }
   ```

   **pattern** options: `dots` · `stripes` · `arch` · `grid` · `waves` · `blocks`  
   **hue** is an oklch hue value (0–360) — picks the tile colour.

3. Run locally to update the listing:
   ```
   node generate.js
   ```

4. Push to `main` — GitHub Actions regenerates and deploys automatically.

## Running locally

Open `index.html` directly in a browser, or serve the root:
```
npx serve .
```

## Deploying

Push to GitHub, enable Pages (Settings → Pages → Source: GitHub Actions). The workflow in `.github/workflows/deploy.yml` handles everything.
