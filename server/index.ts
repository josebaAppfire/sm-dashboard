import 'dotenv/config'
import express from 'express'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig, jiraFetch } from './jira-client.js'
import { fetchBurnup, fetchEpicsForSprint, fetchScopeChanges } from './burnup.js'
import {
  getAllSprints,
  addSprint,
  updateSprint,
  deleteSprint,
  calculatePlanning,
  exportToMarkdown,
} from './store.js'
import { type SprintRecord } from './types.js'
import { findBurnupTeam, getBurnupTeams, sprintMatchesTeam } from './teams.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

// -----------------------------------------------------------------------
// Burnup (Jira)
// -----------------------------------------------------------------------

app.get('/api/config', (_req, res) => {
  res.json({
    jiraBaseUrl: (process.env.JIRA_BASE_URL ?? '').replace(/\/+$/, ''),
    teams: getBurnupTeams(),
  })
})

const burnupCache = new Map<string, { ts: number; data: unknown }>()
const CACHE_TTL_MS = 60_000

app.get('/api/burnup', async (req, res) => {
  let config
  try {
    config = getConfig()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(503).json({ error: message })
    return
  }

  if (req.query.boardId) config.boardId = Number(req.query.boardId)
  if (req.query.sprintId) config.sprintId = Number(req.query.sprintId)

  // Optional epic filter: ?epicKeys=PROJ-10,PROJ-22
  const epicKeys = req.query.epicKeys
    ? String(req.query.epicKeys).split(',').map((k) => k.trim()).filter(Boolean)
    : undefined

  const cacheKey = `${config.boardId}:${config.sprintId}:${(epicKeys ?? []).join(',')}`
  const cached = burnupCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.json(cached.data)
    return
  }

  try {
    const data = await fetchBurnup(config, epicKeys)
    burnupCache.set(cacheKey, { ts: Date.now(), data })
    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/burnup]', message)
    res.status(500).json({ error: message })
  }
})

app.post('/api/cache/clear', (_req, res) => {
  burnupCache.clear()
  res.json({ ok: true })
})

// -----------------------------------------------------------------------
// Epics in sprint
// -----------------------------------------------------------------------

app.get('/api/epics', async (req, res) => {
  let config
  try {
    config = getConfig()
  } catch (err: unknown) {
    res.status(503).json({ error: String(err) })
    return
  }

  const sprintId = req.query.sprintId ? Number(req.query.sprintId) : config.sprintId

  try {
    const epics = await fetchEpicsForSprint(config, sprintId)
    res.json(epics)
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

// -----------------------------------------------------------------------
// Scope changes (initial commitment vs. added/modified during sprint)
// -----------------------------------------------------------------------

app.get('/api/scope-changes', async (req, res) => {
  let config
  try {
    config = getConfig()
  } catch (err: unknown) {
    res.status(503).json({ error: String(err) })
    return
  }

  if (req.query.sprintId) config.sprintId = Number(req.query.sprintId)

  try {
    const data = await fetchScopeChanges(config)
    res.json(data)
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

// -----------------------------------------------------------------------
// Jira sprint list (for sprint selector)
// -----------------------------------------------------------------------

interface JiraSprintPage {
  values: Array<{
    id: number
    name: string
    state: string
    startDate?: string
    endDate?: string
  }>
  isLast: boolean
  nextPage?: string
}

app.get('/api/jira-sprints', async (req, res) => {
  let config
  try {
    config = getConfig()
  } catch (err: unknown) {
    res.status(503).json({ error: String(err) })
    return
  }

  const teamRaw = req.query.team ? String(req.query.team).trim() : undefined
  const team = teamRaw ? findBurnupTeam(teamRaw) : undefined

  const boardId = team
    ? team.boardId
    : req.query.boardId
      ? Number(req.query.boardId)
      : config.boardId
  const limitRaw = req.query.limit ? Number(req.query.limit) : undefined
  const limit = team
    ? (Number.isFinite(limitRaw) && limitRaw! > 0 ? limitRaw! : 5)
    : (Number.isFinite(limitRaw) && limitRaw! > 0 ? limitRaw! : 20)

  try {
    const allSprints: JiraSprintPage['values'] = []
    let startAt = 0
    let isLast = false

    while (!isLast) {
      const r = await jiraFetch(config, `/rest/agile/1.0/board/${boardId}/sprint`, {
        state: 'active,closed',
        maxResults: 50,
        startAt,
      })
      if (!r.ok) {
        res.status(r.status).json({ error: `Jira returned ${r.status}` })
        return
      }
      const page = (await r.json()) as JiraSprintPage
      allSprints.push(...page.values)
      isLast = page.isLast
      startAt += page.values.length
    }

    let sorted = allSprints.sort((a, b) => b.id - a.id)
    if (team) {
      sorted = sorted.filter((s) => sprintMatchesTeam(s.name, team.id))
    }
    sorted = sorted.slice(0, limit).map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state as 'active' | 'closed' | 'future',
        startDate: s.startDate,
        endDate: s.endDate,
      }))

    res.json(sorted)
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

// -----------------------------------------------------------------------
// Sprints store
// -----------------------------------------------------------------------

app.get('/api/sprints', (_req, res) => {
  try {
    res.json(getAllSprints())
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/sprints', (req, res) => {
  try {
    const sprint = req.body as SprintRecord
    if (!sprint.id) {
      res.status(400).json({ error: 'id is required' })
      return
    }
    res.status(201).json(addSprint(sprint))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(409).json({ error: message })
  }
})

app.patch('/api/sprints/:id', (req, res) => {
  try {
    const { id } = req.params
    const updated = updateSprint(id, req.body as Partial<SprintRecord>)
    res.json(updated)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(404).json({ error: message })
  }
})

app.delete('/api/sprints/:id', (req, res) => {
  try {
    deleteSprint(req.params.id)
    res.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(404).json({ error: message })
  }
})

// -----------------------------------------------------------------------
// Planning calculator
// -----------------------------------------------------------------------

// GET /api/planning?devDays=28&reference=Q3-2
app.get('/api/planning', (req, res) => {
  try {
    const devDays = Number(req.query.devDays)
    const reference = String(req.query.reference ?? '')
    if (!devDays || !reference) {
      res.status(400).json({ error: 'devDays and reference are required' })
      return
    }
    res.json(calculatePlanning(devDays, reference))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(400).json({ error: message })
  }
})

// -----------------------------------------------------------------------
// Export velocity-history.md
// -----------------------------------------------------------------------

app.post('/api/sprints/export-md', (_req, res) => {
  try {
    const md = exportToMarkdown()
    const mdPath = resolve(__dirname, '../../metrics/velocity-history.md')
    writeFileSync(mdPath, md, 'utf-8')
    res.json({ ok: true, path: mdPath })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

// -----------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`)
})
