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

The workflow in `.github/workflows/deploy.yml` deploys the site on every push
to `main`. One-time setup:

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge/push to `main`. The site appears at
   `https://<user>.github.io/Weighter/`.
