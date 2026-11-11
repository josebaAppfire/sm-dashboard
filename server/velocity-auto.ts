import {
  type Config,
  fetchBoardSprints,
  jiraFetch,
  type BoardSprint,
} from './jira-client.js'
import {
  paginateJql,
  wasInSprintAtStart,
  toSp,
  type ChangelogHistory,
  type JiraIssue,
} from './burnup.js'
import { sprintMatchesTeam } from './teams.js'
import { type AutoVelocityResponse, type AutoVelocitySprint } from './types.js'

const DELIVERED_LC = new Set(['done', 'waiting for release'])

interface AgileSprintDetail {
  id: number
  name: string
  state: string
  startDate?: string
  endDate?: string
  completeDate?: string
}

function statusNameAt(
  histories: ChangelogHistory[],
  cutoffMs: number,
  currentName: string
): string {
  const events = histories
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === 'status')
        .map((item) => ({
          at: new Date(h.created).getTime(),
          from: item.fromString ?? '',
        }))
    )
    .sort((a, b) => a.at - b.at)

  let name = currentName
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].at > cutoffMs) {
      name = events[i].from || name
    } else {
      break
    }
  }
  return name
}

function cutoffMs(sprint: AgileSprintDetail): number {
  if (sprint.state === 'active') {
    return Date.now()
  }
  const raw = sprint.completeDate ?? sprint.endDate
  if (!raw) return Date.now()
  return new Date(raw).getTime()
}

async function fetchSprintDetail(config: Config, sprintId: number): Promise<AgileSprintDetail> {
  const res = await jiraFetch(config, `/rest/agile/1.0/sprint/${sprintId}`)
  if (!res.ok) throw new Error(`Sprint ${sprintId} not found (${res.status})`)
  return (await res.json()) as AgileSprintDetail
}

function metricsForSprint(
  sprint: AgileSprintDetail,
  issues: JiraIssue[],
  estimateField: string
): Omit<AutoVelocitySprint, 'jiraSprintId' | 'name' | 'state' | 'startDate' | 'endDate' | 'completeDate'> {
  const sprintStartMs = sprint.startDate ? new Date(sprint.startDate).getTime() : 0
  const endMs = cutoffMs(sprint)

  let committed = 0
  let scope = 0
  let delivered = 0
  let l3Delivered = 0

  for (const issue of issues) {
    const issuetypeName =
      (issue.fields?.['issuetype'] as { name?: string } | undefined)?.name ?? ''
    const isL3 = issuetypeName === 'L3 Support'

    const currentSp =
      typeof issue.fields?.[estimateField] === 'number'
        ? (issue.fields[estimateField] as number)
        : 0

    const histories = issue.changelog?.histories ?? []
    const statusNow =
      (issue.fields?.['status'] as { name?: string } | undefined)?.name ?? ''
    const statusAtEnd = statusNameAt(histories, endMs, statusNow)
    const doneAtEnd = DELIVERED_LC.has(statusAtEnd.toLowerCase())

    const spChangesAfterStart = histories
      .filter((h) => new Date(h.created).getTime() > sprintStartMs)
      .flatMap((h) =>
        h.items
          .filter((item) => item.field === 'Story Points')
          .map((item) => ({ created: h.created, item }))
      )
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

    const plannedAtStart =
      sprintStartMs > 0
        ? wasInSprintAtStart(histories, sprint.id, sprintStartMs)
        : true

    let initialSp: number
    if (!plannedAtStart) {
      initialSp = 0
    } else if (spChangesAfterStart.length > 0) {
      initialSp = toSp(spChangesAfterStart[0].item.fromString)
    } else {
      initialSp = currentSp
    }

    if (isL3) {
      if (doneAtEnd) l3Delivered += currentSp
      continue
    }

    if (plannedAtStart) committed += initialSp
    scope += currentSp
    if (doneAtEnd) delivered += currentSp
  }

  return { committed, scope, delivered, l3Delivered }
}

async function computeOneSprint(
  config: Config,
  boardSprint: BoardSprint
): Promise<AutoVelocitySprint> {
  const sprint = await fetchSprintDetail(config, boardSprint.id)
  const issues = await paginateJql(
    config,
    `sprint = ${sprint.id}`,
    ['summary', config.estimateField, 'status', 'issuetype'],
    'changelog'
  )
  const metrics = metricsForSprint(sprint, issues, config.estimateField)

  return {
    jiraSprintId: sprint.id,
    name: sprint.name,
    state: (sprint.state as AutoVelocitySprint['state']) ?? 'closed',
    startDate: sprint.startDate ?? null,
    endDate: sprint.endDate ?? null,
    completeDate: sprint.completeDate ?? null,
    ...metrics,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function fetchAutoVelocity(
  config: Config,
  opts: { boardId: number; teamId: string; limit: number }
): Promise<AutoVelocityResponse> {
  const all = await fetchBoardSprints(config, opts.boardId)
  const selected = all
    .filter((s) => sprintMatchesTeam(s.name, opts.teamId))
    .filter((s) => s.state === 'closed' || s.state === 'active')
    .sort((a, b) => b.id - a.id)
    .slice(0, opts.limit)
    .sort((a, b) => a.id - b.id)

  const sprints = await mapWithConcurrency(selected, 3, (s) => computeOneSprint(config, s))

  return {
    teamId: opts.teamId,
    boardId: opts.boardId,
    sprints,
  }
}
