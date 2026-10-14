import { type BurnupResponse, type CycleTimeResponse } from './types'
import { type AppConfig } from './teams'

export async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`)
  return res.json()
}

export async function fetchBurnup(sprintId?: number, epicKeys?: string[]): Promise<BurnupResponse> {
  const params = new URLSearchParams()
  if (sprintId != null) params.set('sprintId', String(sprintId))
  if (epicKeys && epicKeys.length > 0) params.set('epicKeys', epicKeys.join(','))

  const res = await fetch('/api/burnup' + (params.size > 0 ? '?' + params.toString() : ''))
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json() as Promise<BurnupResponse>
}

export async function fetchCycleTime(
  from: string,
  to: string,
  team?: string,
  epicKeys?: string[]
): Promise<CycleTimeResponse> {
  const params = new URLSearchParams({ from, to })
  if (team) params.set('team', team)
  if (epicKeys && epicKeys.length > 0) params.set('epicKeys', epicKeys.join(','))

  const url = '/api/cycle-time?' + params.toString()
  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error ?? `Server returned ${res.status}`
    )
  }

  return res.json() as Promise<CycleTimeResponse>
}

// -----------------------------------------------------------------------
// Sprints
// -----------------------------------------------------------------------

import { type SprintRecord, type PlanningResult } from './types'

export async function fetchSprints(): Promise<SprintRecord[]> {
  const res = await fetch('/api/sprints')
  if (!res.ok) throw new Error(`Failed to load sprints: ${res.status}`)
  return res.json()
}

export async function saveSprint(sprint: SprintRecord): Promise<SprintRecord> {
  const res = await fetch('/api/sprints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sprint),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}

export async function patchSprint(
  id: string,
  patch: Partial<SprintRecord>
): Promise<SprintRecord> {
  const res = await fetch(`/api/sprints/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}

export async function deleteSprint(id: string): Promise<void> {
  const res = await fetch(`/api/sprints/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
}

export async function fetchPlanning(
  devDays: number,
  reference: string
): Promise<PlanningResult> {
  const params = new URLSearchParams({ devDays: String(devDays), reference })
  const res = await fetch('/api/planning?' + params.toString())
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}

export async function exportToMd(): Promise<void> {
  const res = await fetch('/api/sprints/export-md', { method: 'POST' })
  if (!res.ok) throw new Error(`Export failed: ${res.status}`)
}

// -----------------------------------------------------------------------
// Jira sprint list
// -----------------------------------------------------------------------

import { type JiraSprintOption, type EpicOption, type ScopeChangesResponse } from './types'

export async function fetchJiraSprints(
  boardId?: number,
  team?: string,
  limit?: number,
): Promise<JiraSprintOption[]> {
  const q = new URLSearchParams()
  if (boardId != null) q.set('boardId', String(boardId))
  if (team) q.set('team', team)
  if (limit != null) q.set('limit', String(limit))
  const qs = q.toString()
  const res = await fetch('/api/jira-sprints' + (qs ? `?${qs}` : ''))
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}

export async function fetchEpics(sprintId: number): Promise<EpicOption[]> {
  const res = await fetch(`/api/epics?sprintId=${sprintId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}

export async function fetchScopeChanges(sprintId: number): Promise<ScopeChangesResponse> {
  const res = await fetch(`/api/scope-changes?sprintId=${sprintId}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Server returned ${res.status}`)
  }
  return res.json()
}
