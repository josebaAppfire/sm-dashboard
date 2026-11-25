# SM Dashboard

> **Language:** English. See [README.es.md](README.es.md) for Spanish.

Local web app for Scrum Masters with three tabs:

- **Velocity:** committed, scope and delivered SP per sprint, calculated from Jira.
- **Planning:** SP ceiling and conservative commitment for the next sprint, based on a reference sprint and the team's availability.
- **Sprint:** team issue cycle time, sprint totals, initial planning and scope changes, with live Jira data.

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
> `BURNUP_TEAMS` configures the team selector of every tab (`Name:BoardId`). The name must appear in Jira sprint titles.
> `ESTIMATE_FIELD` is your Jira Story Points field (varies by instance).
> `PORT` is used by the Express backend and by Vite’s `/api` proxy. If 3001 is in use, pick another (e.g. `3002`) and restart `npm run dev`.

### 3. Create the sprint store

```bash
cp data/sprints.example.json data/sprints.json
```

`data/sprints.json` stores the data Jira cannot provide: devs and person-days per sprint, edited from the Velocity tab and used by the Planning tab. It is listed in `.gitignore`.

### 4. Install dependencies and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The UI language (English / Spanish) can be changed from the selector in the top bar. Your choice is saved in the browser (`localStorage`).

## Choosing a sprint

In the **Sprint** tab, pick the team and one of its latest sprints from Jira (the active one is selected by default). `SPRINT_ID` in `.env` is only used as a fallback when the sprint list cannot be loaded.

## Project layout

```
sm-dashboard/
├── server/
│   ├── index.ts         — Express server (/api/*)
│   ├── burnup.ts        — sprint totals, initial planning and scope changes
│   ├── cycle-time.ts    — team issue cycle time
│   ├── velocity-auto.ts — per-sprint velocity from Jira
│   ├── store.ts         — data/sprints.json store and planning calculation
│   ├── teams.ts         — BURNUP_TEAMS parsing
│   ├── jira-client.ts   — auth and fetch helpers
│   └── types.ts         — shared types
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── VelocityPanel.tsx
│   │   ├── PlanningCalculator.tsx
│   │   ├── CycleTimeChart.tsx, SprintTotals.tsx
│   │   └── InitialIssuesPanel.tsx, ScopeChangesPanel.tsx
│   └── lib/
│       ├── api.ts       — client calls to /api
│       └── types.ts     — re-exports server types
└── .env.example
```

## Velocity tab

Pick a team (from `BURNUP_TEAMS`) and how many sprints to show. For each closed or active sprint of that team, the server reads Jira and calculates:

- **Committed:** SP of the issues already in the sprint when it started (rebuilt from the changelog). Issues created after the sprint started, such as sub-tasks, are not counted.
- **Scope:** final SP in the sprint.
- **Delivered:** SP of issues that were in Done or Waiting for Release when the sprint closed.

L3 Support issues are excluded (shown in a separate column). Devs and person-days are not in Jira: type them in the table and they are saved to `data/sprints.json`.

### Devs and person-days

- **Devs:** number of developers who worked in the sprint.
- **Person-days:** sum of the days each dev actually worked during the sprint, i.e. sprint workdays − absences (vacation, sick leave, training…). For example, 5 devs in a 10-workday sprint, one of them on vacation for 2 days: 5 × 10 − 2 = **48 person-days**.

They matter because they measure how much capacity the team had in that sprint. Delivered SP can only be compared across sprints if you know how many people delivered them: 40 SP with 50 person-days is not the same as 40 SP with 35.

The Planning tab uses the reference sprint's person-days to scale its velocity to the next sprint's availability. **A sprint without person-days recorded cannot be used as a reference in Planning**: it is shown disabled in the picker. Fill them in when each sprint closes, while absences are still fresh.

Jira results are cached on the server for 10 minutes. **Refresh** skips that cache and reads Jira again, so a sprint you have just closed shows up right away.

## Planning tab

Uses the same team, sprint count and **Refresh** controls as the Velocity tab, and the same Jira data.

1. **Reference sprint:** list of closed sprints with their delivered SP. The latest one with person-days recorded is selected by default. Sprints without person-days are shown disabled: fill them in the Velocity tab (see [Devs and person-days](#devs-and-person-days)).
2. **Availability:** sprint workdays, team size, devs available this sprint and absences per dev. Each dev's net days = sprint workdays − absences.
3. **Result**, recalculated live:
   - Historical capacity = available person-days ÷ reference person-days, and theoretical capacity = available person-days ÷ (team size × workdays).
   - **Ceiling** = reference SP × historical capacity.
   - **Conservative commitment** = ceiling × (100 − buffer) / 100. The buffer is 8% by default.

The reference SP and the buffer can be edited directly in the result panel. The ↺ button restores the reference SP delivered in Jira. The tab also calculates the % of planned SP linked to sprint goals.

`GET /api/planning?devDays=N&reference=SPRINT_ID` returns the same calculation, with optional `referenceDelivered` and `conservativePct` (92 by default) parameters.

## Sprint tab

- **Cycle time:** active time spent in "In Progress" category statuses for the team's issues delivered in the selected date range, with median, P85 and average. Issues are selected by the Appfire Team field; epics are excluded and L3 Support is included. You can also compare with elapsed time (first In Progress → delivery).
- **Sprint totals:** scope, Done and Done + Waiting for Release.
- **Initial planning:** issues in the sprint when it started. Issues created after the start are excluded.
- **Scope changes:** issues added or re-estimated (SP up or down) during the sprint, with the completed and pending SP of those changes.

Use the epic chips to filter cycle time and sprint totals by epic.

## Definition of “done” (delivered)

For velocity, planning and related stats:

- **Delivered = Done + Waiting for Release**
