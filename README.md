# Weighter

A private weight tracker for the "skip breakfast, porridge for lunch" method.
Log a morning weigh-in, mark the days you had beer or something unhealthy, and
watch the trend line project when you'll hit your goal.

- **No backend, no account.** Everything is stored in your browser's
  localStorage — data never leaves your device. Use *Export JSON* for backups
  (and to move between devices/browsers).
- **Weight log** — one weigh-in per day; re-logging a date replaces it.
- **Event markers** — independent data points ("🍺 Beer", "🍕 Junk food") drawn
  as diamonds on the chart's timeline so you can see if they bend the curve.
- **Trend & projection** — a least-squares fit over the last 4 weeks of
  weigh-ins, extended as a dashed line. Set a goal weight to get a projected
  date, plus projected dates for every whole-kg milestone on the way down.

## Development

Plain HTML/CSS/JS — no build step, no dependencies.

```sh
npm run serve   # http://localhost:8080
npm test        # unit tests for the trend/projection math (Node 18+)
```

## Deploying to GitHub Pages

GitHub Pages serves the site straight from the `main` branch
(**Settings → Pages → Deploy from a branch → `main`**), so every merge to
`main` goes live at https://monsharen.github.io/Weighter/ within a minute or
two — no build step. The `.nojekyll` file makes Pages publish the files as-is,
and `.github/workflows/ci.yml` runs the unit tests on every push and PR.
