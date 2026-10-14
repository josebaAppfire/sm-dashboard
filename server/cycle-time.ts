import { type BoardSprint, type Config, fetchBoardSprints, jiraFetch } from './jira-client.js'
import { buildEpicFilter, paginateJql, type ChangelogHistory, type JiraIssue } from './burnup.js'
import { sprintMatchesTeam } from './teams.js'
import {
  type CycleTimeIssue,
  type CycleTimeResponse,
  type CycleTimeSprintSummary,
  type CycleTimeStats,
} from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERED_LC = new Set(['done', 'waiting for release'])
const CHANGELOG_CONCURRENCY = 8
const BOARD_SPRINTS_TTL_MS = 10 * 60_000

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const boardSprintsCache = new Map<number, { ts: number; sprints: BoardSprint[] }>()

async function cachedBoardSprints(config: Config, boardId: number): Promise<BoardSprint[]> {
  const hit = boardSprintsCache.get(boardId)
  if (hit && Date.now() - hit.ts < BOARD_SPRINTS_TTL_MS) return hit.sprints
  const sprints = await fetchBoardSprints(config, boardId)
  boardSprintsCache.set(boardId, { ts: Date.now(), sprints })
  return sprints
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

let statusCategoryCache: Map<string, string> | null = null

/** Status id → statusCategory key ("new" | "indeterminate" | "done"). */
async function fetchStatusCategories(config: Config): Promise<Map<string, string>> {
  if (statusCategoryCache) return statusCategoryCache
  const res = await jiraFetch(config, '/rest/api/3/status')
  if (!res.ok) throw new Error(`Jira status endpoint returned ${res.status}`)
  const statuses = (await res.json()) as Array<{ id: string; statusCategory?: { key: string } }>
  statusCategoryCache = new Map(statuses.map((s) => [s.id, s.statusCategory?.key ?? '']))
  return statusCategoryCache
}

/** Search results may truncate the changelog; fetch the full one when needed. */
async function fullChangelog(config: Config, issue: JiraIssue): Promise<ChangelogHistory[]> {
  const embedded = issue.changelog?.histories ?? []
  const total = issue.changelog?.total ?? embedded.length
  if (total <= embedded.length) return embedded

  const all: ChangelogHistory[] = []
  let startAt = 0
  for (;;) {
    const res = await jiraFetch(config, `/rest/api/3/issue/${issue.key}/changelog`, {
      startAt,
      maxResults: 100,
    })
    if (!res.ok) return embedded
    const page = (await res.json()) as { values: ChangelogHistory[]; isLast?: boolean }
    all.push(...page.values)
    startAt += page.values.length
    if (page.isLast || page.values.length === 0) break
  }
  return all
}

/** Nearest-rank percentile over an ascending-sorted array. */
function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil(p * sorted.length) - 1)
  return sorted[idx]
}

const round1 = (n: number) => Math.round(n * 10) / 10

function computeStats(values: number[]): CycleTimeStats | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: round1(percentile(sorted, 0.5)),
    p85: round1(percentile(sorted, 0.85)),
    avg: round1(sorted.reduce((s, v) => s + v, 0) / sorted.length),
    max: round1(sorted[sorted.length - 1]),
  }
}

/**
 * Start = first transition into an "In Progress" category status.
 * End = entry into Done / Waiting for Release that was never followed by a reopen.
 */
function cycleBounds(
  histories: ChangelogHistory[],
  categories: Map<string, string>
): { startMs: number | null; endMs: number | null } {
  const transitions = histories
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === 'status')
        .map((i) => ({
          at: new Date(h.created).getTime(),
          fromName: (i.fromString ?? '').toLowerCase(),
          toName: (i.toString ?? '').toLowerCase(),
          toId: i.to ?? '',
        }))
    )
    .sort((a, b) => a.at - b.at)

  let startMs: number | null = null
  let endMs: number | null = null
  for (const t of transitions) {
    if (startMs === null && categories.get(t.toId) === 'indeterminate' && !DELIVERED_LC.has(t.toName)) {
      startMs = t.at
    }
    const fromDelivered = DELIVERED_LC.has(t.fromName)
    const toDelivered = DELIVERED_LC.has(t.toName)
    if (toDelivered && !fromDelivered) endMs = t.at
    else if (!toDelivered && fromDelivered) endMs = null
  }

  return { startMs, endMs }
}

// -----------------------------------------------------------------------
// Cycle time (calendar days) for the team's issues delivered between `from`
// and `to` (inclusive, YYYY-MM-DD). The team scope is the set of team sprints
// overlapping that range. L3 Support included.
// -----------------------------------------------------------------------

export interface CycleTimeQuery {
  boardId: number
  teamId?: string
  from: string
  to: string
  epicKeys?: string[]
}

export async function fetchCycleTime(
  config: Config,
  { boardId, teamId, from, to, epicKeys }: CycleTimeQuery
): Promise<CycleTimeResponse> {
  const windowStart = new Date(`${from}T00:00:00`).getTime()
  const windowEnd = new Date(`${to}T00:00:00`).getTime() + DAY_MS

  const sprints = (await cachedBoardSprints(config, boardId))
    .filter((s) => s.startDate && s.endDate)
    .filter((s) => !teamId || sprintMatchesTeam(s.name, teamId))
    .filter((s) => new Date(s.startDate!).getTime() < windowEnd && new Date(s.endDate!).getTime() >= windowStart)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())

  if (sprints.length === 0) {
    return { from, to, sprints: [], issues: [], stats: null, skippedNoStart: 0 }
  }

  // History clauses ("status changed ... during") make Jira search several times slower;
  // the completion-date filter is applied below from the changelog instead.
  const [categories, issues] = await Promise.all([
    fetchStatusCategories(config),
    paginateJql(
      config,
      `sprint in (${sprints.map((s) => s.id).join(',')}) AND status in (Done, "Waiting for Release") ${buildEpicFilter(epicKeys)}`,
      ['summary', 'issuetype', config.estimateField],
      'changelog'
    ),
  ])
  const histories = await mapWithConcurrency(issues, CHANGELOG_CONCURRENCY, (i) => fullChangelog(config, i))

  const sprintForCompletion = (ms: number): number | null => {
    let match: number | null = null
    for (const s of sprints) {
      if (new Date(s.startDate!).getTime() <= ms) match = s.id
    }
    return match
  }

  const result: CycleTimeIssue[] = []
  let skippedNoStart = 0

  issues.forEach((issue, idx) => {
    const { startMs, endMs } = cycleBounds(histories[idx], categories)
    if (endMs === null || endMs < windowStart || endMs >= windowEnd) return
    if (startMs === null || startMs > endMs) {
      skippedNoStart++
      return
    }
    const bounds = { startMs, endMs }

    const sp = issue.fields?.[config.estimateField]
    result.push({
      key: issue.key,
      summary: typeof issue.fields?.['summary'] === 'string' ? issue.fields['summary'] : issue.key,
      issueType: (issue.fields?.['issuetype'] as { name?: string } | undefined)?.name ?? '',
      sp: typeof sp === 'number' ? sp : null,
      startedAt: new Date(bounds.startMs).toISOString(),
      completedAt: new Date(bounds.endMs).toISOString(),
      cycleDays: round1((bounds.endMs - bounds.startMs) / DAY_MS),
      sprintId: sprintForCompletion(bounds.endMs),
    })
  })

  result.sort((a, b) => a.completedAt.localeCompare(b.completedAt))

  const sprintSummaries: CycleTimeSprintSummary[] = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    stats: computeStats(result.filter((i) => i.sprintId === s.id).map((i) => i.cycleDays)),
  }))

  return {
    from,
    to,
    sprints: sprintSummaries,
    issues: result,
    stats: computeStats(result.map((i) => i.cycleDays)),
    skippedNoStart,
  }
}
