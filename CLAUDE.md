# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anomaly Detection Dashboard — a single-page web app for detecting outliers in numerical datasets. Pure HTML/CSS/JS with zero dependencies and no build step.

Powered by Tertiary Infotech Academy Pte Ltd (https://www.tertiarycourses.com.sg/).

## Running Locally

```bash
python -m http.server 8000
# or
npx http-server -p 8000 -c-1
```

Open `http://localhost:8000/`. There is no build, lint, or test tooling.

## Architecture

The entire app is three files:

- **index.html** — semantic layout: header, controls sidebar (data input + detection config), chart canvas, stats grid, anomaly list, data table, footer.
- **styles.css** — CSS custom properties for theming (light/dark via `[data-theme]` attribute on `<html>`). CSS Grid dashboard layout that collapses to single-column at 960px. All colors, shadows, and radii are design tokens in `:root`.
- **script.js** — single IIFE module containing all logic:
  - **State**: `state.raw` (number array), `state.anomalies` (Set of indices), `state.method`, `state.threshold`, `state.points` (hit-test cache for canvas tooltip).
  - **Detection**: `detectZScore()` and `detectIQR()` — stateless functions that return a Set of anomaly indices.
  - **Rendering pipeline**: `runDetection()` → `render()` which calls `renderStats()`, `renderAnomalyList()`, `renderTable()`, `renderChart()`.
  - **Canvas chart**: custom DPR-aware rendering with gridlines, axis ticks, line plot, and anomaly point highlighting. Reads CSS custom properties for colors so it respects the current theme.
  - **Input handling**: debounced text parsing, CSV file upload via FileReader, sample data generator.

Data flow is unidirectional: user input → parse → update `state.raw` → `runDetection()` → `render()`. Theme is persisted in `localStorage`.

## Deployment

GitHub Pages via `.github/workflows/pages.yml` — deploys the repo root on push to `main`. No build artifact; the static files are served directly.
