# SM Dashboard

> **Language:** English. See [README.es.md](README.es.md) for Spanish.

Local web app for Scrum Masters: velocity calculated automatically from Jira, active-sprint view with live Jira data, and planning helpers.

## Requirements

- Node 18+ (the project uses native `fetch`)
- Jira Cloud read access to your project/board

## One-time setup

### 1. Create an Atlassian API token

1. Go to [Atlassian Account → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Use a descriptive name, e.g. `sm-dashboard-local`
4. Copy the token (you cannot view it again later)

### 2. Create the `.env` file

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=you@your-company.com
JIRA_API_TOKEN=ATATTxxxxxxxx...
BOARD_ID=123
BURNUP_TEAMS=TeamA:123,TeamB:456
SPRINT_ID=1000
ESTIMATE_FIELD=customfield_10016
PORT=3001
```

> `.env` is in `.gitignore` — it is never committed.
> `BURNUP_TEAMS` configures the burnup team selector (`Name:BoardId`). The name must appear in Jira sprint titles.
> `ESTIMATE_FIELD` is your Jira Story Points field (varies by instance).
> `PORT` is used by the Express backend and by Vite’s `/api` proxy. If 3001 is in use, pick another (e.g. `3002`) and restart `npm run dev`.

### 3. Create the sprint store

```bash
cp data/sprints.example.json data/sprints.json
```

`data/sprints.json` stores the data Jira cannot provide (devs and person-days per sprint, edited from the Velocity tab) and the references used by the Planning calculator. It is listed in `.gitignore`.

### 4. Install dependencies and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The UI language (English / Spanish) can be changed from the selector in the top bar. Your choice is saved in the browser (`localStorage`).

## Changing the active sprint

Edit `SPRINT_ID` in `.env` and click **Actualizar** in the UI (or restart the server). The burnup tab also lets you pick a sprint from Jira when teams are configured.

## Project layout

```
sm-dashboard/
├── server/
│   ├── index.ts        — Express server (/api/*)
│   ├── burnup.ts       — sprint totals and scope changes
│   ├── velocity-auto.ts — per-sprint velocity from Jira
│   ├── jira-client.ts  — auth and fetch helpers
│   └── types.ts        — shared types
├── src/
│   ├── App.tsx
│   ├── components/VelocityPanel.tsx
│   └── lib/
│       ├── api.ts      — client calls to /api
│       └── types.ts    — re-exports server types
└── .env.example
```

## Data: GreenHopper vs REST fallback

The server first calls the internal GreenHopper endpoint (`scopechangeburndownchart`), which returns the full time series (same source as Jira’s chart).

If GreenHopper is unavailable or errors, it falls back to the official Jira REST API, which only exposes current totals (no daily progress line). The UI shows a yellow notice in that case.

## Velocity tab

Pick a team (from `BURNUP_TEAMS`) and how many sprints to show. For each closed or active sprint of that team, the server reads Jira and calculates:

- **Committed:** SP of the issues already in the sprint when it started (rebuilt from the changelog).
- **Scope:** final SP in the sprint.
- **Delivered:** SP of issues that were in Done or Waiting for Release when the sprint closed.

L3 Support issues are excluded (shown in a separate column). Devs and person-days are not in Jira: type them in the table and they are saved to `data/sprints.json`. Results are cached for 10 minutes.

## Definition of “done” (delivered)

For velocity and related stats:

- **Delivered = Done + Waiting for Release**

The “Done + Waiting for Release” stat uses this rule. The completion line on the chart follows GreenHopper’s `done` series on the board, which may differ slightly from column mapping.
