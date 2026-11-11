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
/** Jira's sprint custom field. Issues are attributed to a sprint only when they belong to it. */
const SPRINT_FIELD = 'customfield_10019'
/** "Appfire Team" select field — how Jellyfish assigns issues to a team. */
const TEAM_FIELD = 'cf[10543]'
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

/** Classic median: average of the two central values when the count is even. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Round half to even, on the decimal representation. Jellyfish shows 1.08 for a
 * median of 1.085, which is what this rule (and Python's) produces.
 */
function round2(n: number): number {
  const negative = n < 0
  const [intRaw, fracRaw = ''] = Math.abs(n).toFixed(8).split('.')
  const frac = fracRaw.padEnd(8, '0')
  let hundredths = Number(intRaw) * 100 + Number(frac.slice(0, 2))
  const next = frac[2]
  const remainder = /[1-9]/.test(frac.slice(3))
  if (next > '5' || (next === '5' && (remainder || hundredths % 2 === 1))) hundredths += 1
  return (negative ? -hundredths : hundredths) / 100
}

function computeStats(values: number[]): CycleTimeStats | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: round2(median(sorted)),
    p85: round2(percentile(sorted, 0.85)),
    avg: round2(sorted.reduce((s, v) => s + v, 0) / sorted.length),
    max: round2(sorted[sorted.length - 1]),
  }
}

interface CycleMeasure {
  /** Sum of time spent in "In Progress" category statuses. Null if it never entered one. */
  activeMs: number | null
  /** First "In Progress" entry until final delivery. Null when there is no start or delivery. */
  elapsedMs: number | null
  startMs: number | null
  endMs: number | null
}

/**
 * Active time (Jellyfish cycle time) sums every interval spent in an
 * "In Progress" category status; waits in Triage / Waiting Response and
 * intermediate Done periods don't count. Elapsed time runs from the first
 * "In Progress" entry to the final delivery (Done / Waiting for Release),
 * reopening included.
 */
function measureCycle(
  histories: ChangelogHistory[],
  categories: Map<string, string>
): CycleMeasure {
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

  let activeMs = 0
  let since: number | null = null
  let startMs: number | null = null
  let endMs: number | null = null
  let sawActive = false
  for (const t of transitions) {
    if (since !== null) {
      activeMs += t.at - since
      since = null
    }
    if (categories.get(t.toId) === 'indeterminate') {
      since = t.at
      sawActive = true
      if (startMs === null) startMs = t.at
    }
    const fromDelivered = DELIVERED_LC.has(t.fromName)
    const toDelivered = DELIVERED_LC.has(t.toName)
    if (toDelivered && !fromDelivered) endMs = t.at
    else if (!toDelivered && fromDelivered) endMs = null
  }

  return {
    activeMs: sawActive ? activeMs : null,
    elapsedMs: startMs !== null && endMs !== null && endMs >= startMs ? endMs - startMs : null,
    startMs,
    endMs,
  }
}

/** Sprint ids the issue is assigned to (Jira sprint field). */
function issueSprintIds(issue: JiraIssue): Set<number> {
  const raw = issue.fields?.[SPRINT_FIELD]
  if (!Array.isArray(raw)) return new Set()
  return new Set(
    raw.map((s) => (s as { id?: unknown })?.id).filter((id): id is number => typeof id === 'number')
  )
}

// -----------------------------------------------------------------------
// Cycle time for the team's issues delivered between `from` and `to`
// (inclusive, YYYY-MM-DD), matching Jellyfish:
//   - team from the "Appfire Team" field, epics excluded, L3 Support included
//   - cycle time = calendar days spent in "In Progress" category statuses
// The team's sprints overlapping the range are returned as a breakdown;
// issues without a sprint get their own row.
// -----------------------------------------------------------------------

export interface CycleTimeQuery {
  boardId: number
  teamId: string
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

  // "updated >= from" only narrows the search: an issue delivered inside the
  // window was updated inside it. The exact delivery date is checked below.
  const [categories, issues] = await Promise.all([
    fetchStatusCategories(config),
    paginateJql(
      config,
      `${TEAM_FIELD} = "${teamId}" AND issuetype != Epic AND status in (Done, "Waiting for Release") AND updated >= "${from}" ${buildEpicFilter(epicKeys)}`,
      ['summary', 'issuetype', config.estimateField, SPRINT_FIELD],
      'changelog'
    ),
  ])
  const histories = await mapWithConcurrency(issues, CHANGELOG_CONCURRENCY, (i) => fullChangelog(config, i))

  /** Latest-starting team sprint the issue belongs to that had already started at delivery. */
  const sprintForIssue = (issue: JiraIssue, endMs: number): number | null => {
    const ids = issueSprintIds(issue)
    let match: number | null = null
    for (const s of sprints) {
      if (ids.has(s.id) && new Date(s.startDate!).getTime() <= endMs) match = s.id
    }
    return match
  }

  const result: CycleTimeIssue[] = []
  let skippedNoStart = 0

  issues.forEach((issue, idx) => {
    const measure = measureCycle(histories[idx], categories)
    if (measure.endMs === null || measure.endMs < windowStart || measure.endMs >= windowEnd) return
    if (measure.activeMs === null || measure.startMs === null) {
      skippedNoStart++
      return
    }

    const sp = issue.fields?.[config.estimateField]
    result.push({
      key: issue.key,
      summary: typeof issue.fields?.['summary'] === 'string' ? issue.fields['summary'] : issue.key,
      issueType: (issue.fields?.['issuetype'] as { name?: string } | undefined)?.name ?? '',
      sp: typeof sp === 'number' ? sp : null,
      startedAt: new Date(measure.startMs).toISOString(),
      completedAt: new Date(measure.endMs).toISOString(),
      cycleDays: round2(measure.activeMs / DAY_MS),
      elapsedDays: round2((measure.elapsedMs ?? measure.activeMs) / DAY_MS),
      sprintId: sprintForIssue(issue, measure.endMs),
    })
  })

  result.sort((a, b) => a.completedAt.localeCompare(b.completedAt))

  const summaryFor = (group: CycleTimeIssue[]): Pick<CycleTimeSprintSummary, 'stats' | 'elapsed'> => ({
    stats: computeStats(group.map((i) => i.cycleDays)),
    elapsed: computeStats(group.map((i) => i.elapsedDays)),
  })

  const sprintSummaries: CycleTimeSprintSummary[] = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    ...summaryFor(result.filter((i) => i.sprintId === s.id)),
  }))

  const noSprint = result.filter((i) => i.sprintId === null)
  if (noSprint.length > 0) {
    sprintSummaries.push({ id: null, name: '', ...summaryFor(noSprint) })
  }

  return {
    from,
    to,
    sprints: sprintSummaries,
    issues: result,
    ...summaryFor(result),
    skippedNoStart,
  }
}
