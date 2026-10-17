# 🗺️ shiori

**English** | [日本語](README.ja.md)

[![deploy](https://github.com/reibomaru/shiori/actions/workflows/deploy.yml/badge.svg)](https://github.com/reibomaru/shiori/actions/workflows/deploy.yml)

A self-hosted travel guidebook ("shiori") app for planning trips together with AI. Powered by [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent), it lets you talk to an AI in the browser while editing your route, day-by-day itinerary, places to visit, budget, and travel notes — all stored in **a single SQLite database** — and export the result straight to PDF.

## Features

- 🗺️ **Map & route** — A deck.gl map showing waypoints as numbered pins and legs as lines (arcs for flights, real GeoJSON paths for ground travel). Switch between standard / satellite / terrain / light base maps.
- 🗓️ **Itinerary** — Add, edit, and reorder each day's plans with a drag-and-drop builder.
- 🧭 **Spot candidates** — Manage places you want to visit as a list or on the map, with Google ratings (★), photos, and Instagram galleries.
- 💰 **Budget** — Track budgets by category.
- 📝 **Notes** — Travel notes with image import / information extraction and a page relationship graph (Mermaid).
- 🤖 **AI assistant** — Researches the web from natural-language instructions and **proposes** spots and notes (applied only after you approve the preview). Image attachments are supported.
- 🖨️ **PDF export** — A print layout that hides interactive UI; use your browser's "Save as PDF".
- 🌐 **Multilingual UI** — Japanese / English / French / Simplified Chinese.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 24 (pinned in `.nvmrc`; required for the built-in `node:sqlite` and TypeScript type stripping)
- [pnpm](https://pnpm.io/) 9 or later

If you use `nvm`, run `nvm use` at the repository root (it reads `.nvmrc`). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow and contribution guidelines.

### 1. Install

```bash
git clone https://github.com/reibomaru/shiori.git
cd shiori
pnpm install
```

### 2. Configure

To use the AI assistant, set up environment variables (skip this if you don't need it).

```bash
cp .env.example .env
```

Load the initial data (a sample itinerary) into SQLite.

```bash
pnpm db:init
```

### 3. Run

```bash
pnpm dev   # starts the API (:8080) and Vite (:5173) together
```

Open http://localhost:5173 in your browser. Run `pnpm db:reset` to recreate the data.

## Using Skills

The Claude Code [`travel-plan`](.claude/skills/travel-plan/SKILL.md) skill edits the route / itinerary / spot candidates / budget in one place (they are tightly coupled in a single DB, so they're consolidated into one skill). Under the hood it uses the following CLI:

```bash
node scripts/travel.ts summary                     # get the big picture first
node scripts/travel.ts route | legs | days | spots | budget
node scripts/travel.ts add-spot '{"name":"…", "url":"…"}'
node scripts/travel.ts add-item 7 '{"time":"15:00","type":"spot","title":"…"}'
node scripts/sql.ts "<SQL>"                          # escape hatch for operations the CLI doesn't cover
```

Real paths for route legs can be imported from GeoJSON / GPX (`set-geojson` / `set-gpx`), or filled in from OSRM with `scripts/osrm-route.ts`.

On the spots page (`/spots`) and notes page (`/memo`), the **AI assistant** tab lets you ask the AI directly from the browser without using the skill. The AI never writes to the DB directly; changes are applied only when you review / edit a proposal card and click "Save" (preview-and-approve).

## User approval (admin dashboard)

Sign-in is invite-only. New users are registered in Firestore `users` with `allowed: false` (pending approval) and cannot use the app until approved. Approvals are handled in the admin dashboard at `/admin` (user list, approve / revoke, role changes).

Access control has two layers:

1. **Basic auth** — Everything under `/admin` (UI + API). Enabled only when both `ADMIN_BASIC_USER` and `ADMIN_BASIC_PASS` are set; otherwise `/admin` is closed with 503.
2. **`role: admin` (Google SSO)** — `/admin/api/*`. Non-admins get 403.

Bootstrap the first admins with `ADMIN_EMAILS` (comma-separated). Listed emails are automatically promoted to `allowed: true` / `role: admin` on sign-in. Further role changes can be made from the dashboard.

## Configuration

Environment variables for the admin dashboard (`.env`):

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_BASIC_USER` | (unset disables `/admin`) | Basic auth username for `/admin` |
| `ADMIN_BASIC_PASS` | (unset disables `/admin`) | Basic auth password for `/admin` |
| `ADMIN_EMAILS` | (optional) | Initial admin emails (comma-separated). Promoted to `allowed`/`admin` on sign-in |

Environment variables for the AI assistant (`.env`):

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | (required) | Gemini API key (https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model to use (`gemini-3-pro-preview` for complex research) |
| `WEBSEARCH_API_KEY` | (optional) | For `web_search` (https://websearchapi.ai). If unset, only web_search is disabled |
| `GOOGLE_MAPS_API_KEY` | (optional) | Fetches Google ratings (★) and photos for spots. Cached for 30 days in `spot_place_cache` |

## Documentation

The following documents are written in Japanese.

- [`.claude/skills/travel-plan/SKILL.md`](.claude/skills/travel-plan/SKILL.md) — Data-editing skill and recipes (`recipes/`)
- [`docs/er-diagram.md`](docs/er-diagram.md) — Data model (SQLite)
- [`docs/gcp-deployment-design.md`](docs/gcp-deployment-design.md) — Production deployment design (Cloud Run / Litestream)
- For schema changes, add a numbered SQL file to `db/migrations/` and apply it with `node db/migrate.ts` (in production, `.github/workflows/deploy.yml` automatically migrates → deploys on push)
- Infrastructure (Cloud Run / Artifact Registry / IAM / GCS) is managed in [`infra/terraform`](infra/terraform)

Stack: **SQLite** (`node:sqlite`) / **Hono** API / **React 19 + Vite + React Router + Tailwind CSS v4** / **deck.gl** (maps) / **pi-coding-agent + Gemini** (AI) / **Docker → Cloud Run + Litestream** (production).
