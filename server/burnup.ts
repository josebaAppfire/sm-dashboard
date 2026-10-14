import { type Config, jiraFetch } from './jira-client.js'
import {
  type BurnupPoint,
  type BurnupResponse,
  type EpicOption,
  type InitialIssue,
  type L3SupportIssue,
  type ScopeChange,
  type ScopeChangesResponse,
  type SprintMeta,
} from './types.js'

// -----------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------

interface ChangelogItem {
  field: string
  from?: string | null
  to?: string | null
  fromString?: string | null
  toString?: string | null
}

interface ChangelogHistory {
  created: string
  items: ChangelogItem[]
}

interface JiraIssue {
  key: string
  fields?: Record<string, unknown>
  changelog?: { histories: ChangelogHistory[] }
}

interface JiraSearchResponse {
  issues: JiraIssue[]
  nextPageToken?: string
  isLast: boolean
}

async function paginateJql(
  config: Config,
  jql: string,
  fields: string[],
  expand?: string
): Promise<JiraIssue[]> {
  const allIssues: JiraIssue[] = []
  let nextPageToken: string | undefined

  do {
    const params: Record<string, string | number> = {
      jql,
      fields: fields.join(','),
      maxResults: 100,
    }
    if (nextPageToken) params.nextPageToken = nextPageToken
    if (expand) params.expand = expand

    const res = await jiraFetch(config, '/rest/api/3/search/jql', params)
    if (!res.ok) break

    const data = (await res.json()) as JiraSearchResponse
    allIssues.push(...data.issues)
    nextPageToken = data.isLast ? undefined : data.nextPageToken
  } while (nextPageToken)

  return allIssues
}

function sumSp(issues: JiraIssue[], field: string): number {
  return issues.reduce((sum, i) => {
    const v = i.fields?.[field]
    return sum + (typeof v === 'number' ? v : 0)
  }, 0)
}

// -----------------------------------------------------------------------
// Epics in sprint
// Returns unique parent issues present in the sprint (excluding L3 Support).
// Issues without a parent are represented by the sentinel key "__NO_PARENT__".
// -----------------------------------------------------------------------

const NO_PARENT_KEY = '__NO_PARENT__'

export async function fetchEpicsForSprint(
  config: Config,
  sprintId: number
): Promise<EpicOption[]> {
  const issues = await paginateJql(
    config,
    `sprint = ${sprintId} AND issuetype != "L3 Support"`,
    ['parent']
  )

  const epicsMap = new Map<string, string>() // key → summary
  let hasNoParent = false

  for (const issue of issues) {
    const parent = issue.fields?.['parent'] as
      | { key: string; fields?: { summary?: string } }
      | null
      | undefined

    if (parent?.key) {
      epicsMap.set(parent.key, parent.fields?.summary ?? parent.key)
    } else {
      hasNoParent = true
    }
  }

  const result: EpicOption[] = [...epicsMap.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (hasNoParent) {
    result.push({ key: NO_PARENT_KEY, name: 'Sin épica' })
  }

  return result
}

function buildEpicFilter(epicKeys?: string[]): string {
  if (!epicKeys || epicKeys.length === 0) return ''

  const realKeys = epicKeys.filter((k) => k !== NO_PARENT_KEY)
  const includeNoParent = epicKeys.includes(NO_PARENT_KEY)

  const parts: string[] = []
  if (realKeys.length > 0) parts.push(`parent in (${realKeys.join(',')})`)
  if (includeNoParent) parts.push('parent is EMPTY')

  if (parts.length === 0) return ''
  return parts.length === 1 ? `AND ${parts[0]}` : `AND (${parts.join(' OR ')})`
}

// -----------------------------------------------------------------------
// REST burnup: current totals + simplified two-point series.
// Issues of type "L3 Support" are always excluded.
// When epicKeys is provided (non-empty), only those epics are counted.
// -----------------------------------------------------------------------

export async function fetchBurnup(
  config: Config,
  epicKeys?: string[]
): Promise<BurnupResponse> {
  const sprintRes = await jiraFetch(
    config,
    `/rest/agile/1.0/sprint/${config.sprintId}`
  )
  if (!sprintRes.ok) {
    throw new Error(
      `Jira sprint endpoint returned ${sprintRes.status}. Check JIRA_API_TOKEN and SPRINT_ID in .env.`
    )
  }
  const sprint = (await sprintRes.json()) as SprintMeta

  const EXCLUDE_L3 = `AND issuetype != "L3 Support"`
  const EPIC_FILTER = buildEpicFilter(epicKeys)

  const all = await paginateJql(
    config,
    `sprint = ${config.sprintId} ${EXCLUDE_L3} ${EPIC_FILTER}`,
    [config.estimateField, 'status']
  )

  const doneIssues = all.filter((i) => {
    const status = (i.fields as { status?: { statusCategory?: { key: string } } } | undefined)?.status
    return status?.statusCategory?.key === 'done'
  })

  const wfrIssues = await paginateJql(
    config,
    `sprint = ${config.sprintId} AND status in (Done, "Waiting for Release") ${EXCLUDE_L3} ${EPIC_FILTER}`,
    [config.estimateField]
  )

  const scopeSp = sumSp(all, config.estimateField)
  const completedSp = sumSp(doneIssues, config.estimateField)
  const wfrSp = sumSp(wfrIssues, config.estimateField)

  const startDate = sprint.startDate ?? new Date().toISOString()
  const series: BurnupPoint[] = [
    { date: startDate, scope: scopeSp, completed: 0 },
    { date: new Date().toISOString(), scope: scopeSp, completed: completedSp },
  ]

  return {
    sprint,
    series,
    totals: { scope: scopeSp, completed: completedSp, completedIncludingWfR: wfrSp },
    dataSource: 'rest',
  }
}

// -----------------------------------------------------------------------
// Scope changes: initial commitment vs. scope added/modified during sprint
// -----------------------------------------------------------------------

function toSp(val: string | null | undefined): number {
  if (val == null || val === '') return 0
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

function parseSprintIds(raw: string | null | undefined): Set<number> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
  )
}

/** Reconstruct whether the issue was in the sprint at sprint start (uses sprint IDs, not names). */
function wasInSprintAtStart(
  histories: ChangelogHistory[],
  sprintId: number,
  sprintStartMs: number
): boolean {
  const events = histories
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === 'Sprint' && i.to != null && i.to !== '')
        .map((item) => ({
          at: new Date(h.created).getTime(),
          from: item.from ?? '',
          to: item.to ?? '',
        }))
    )
    .sort((a, b) => a.at - b.at)

  let inSprint = false
  let sawEventOnOrBeforeStart = false
  for (const ev of events) {
    if (ev.at > sprintStartMs) break
    inSprint = parseSprintIds(ev.to).has(sprintId)
    sawEventOnOrBeforeStart = true
  }

  if (sawEventOnOrBeforeStart) return inSprint

  // Changelog may not include pre-start history — infer from first post-start sprint change
  const firstAfter = events.find((ev) => ev.at > sprintStartMs)
  if (!firstAfter) {
    // No sprint changes in changelog; issue is in sprint via JQL → treat as initial planning
    return true
  }
  if (parseSprintIds(firstAfter.from).has(sprintId)) {
    return true
  }
  if (parseSprintIds(firstAfter.to).has(sprintId)) {
    return false
  }
  return true
}

export async function fetchScopeChanges(
  config: Config
): Promise<ScopeChangesResponse> {
  // Sprint metadata
  const sprintRes = await jiraFetch(config, `/rest/agile/1.0/sprint/${config.sprintId}`)
  if (!sprintRes.ok) throw new Error(`Sprint ${config.sprintId} not found`)
  const sprint = (await sprintRes.json()) as SprintMeta
  const sprintStartMs = new Date(sprint.startDate).getTime()

  // All issues with changelog (including L3 Support — needed for initialIssues)
  const issues = await paginateJql(
    config,
    `sprint = ${config.sprintId}`,
    ['summary', config.estimateField, 'status', 'issuetype'],
    'changelog'
  )

  const DONE_SET_LC = new Set(['done', 'waiting for release'])
  const changes: ScopeChange[] = []
  const initialIssues: InitialIssue[] = []
  const l3AllIssuesMap: L3SupportIssue[] = []
  let initialCommitment = 0
  let currentScope = 0

  for (const issue of issues) {
    const issuetypeName = (issue.fields?.['issuetype'] as { name?: string } | undefined)?.name ?? ''
    const isL3 = issuetypeName === 'L3 Support'

    const currentSp = typeof issue.fields?.[config.estimateField] === 'number'
      ? (issue.fields[config.estimateField] as number)
      : 0

    const histories = issue.changelog?.histories ?? []
    const summary = typeof issue.fields?.['summary'] === 'string'
      ? issue.fields['summary']
      : issue.key

    const status = (issue.fields?.['status'] as { name?: string } | undefined)?.name ?? '—'

    const plannedAtStart = wasInSprintAtStart(histories, config.sprintId, sprintStartMs)

    // SP changes that happened AFTER sprint start, sorted oldest first
    const spChangesAfterStart = histories
      .filter((h) => new Date(h.created).getTime() > sprintStartMs)
      .flatMap((h) =>
        h.items
          .filter((item) => item.field === 'Story Points')
          .map((item) => ({ created: h.created, item }))
      )
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

    let initialSp: number
    if (!plannedAtStart) {
      initialSp = 0
    } else if (spChangesAfterStart.length > 0) {
      initialSp = toSp(spChangesAfterStart[0].item.fromString)
    } else {
      initialSp = currentSp
    }

    // Collect L3 issues for the L3 panel
    if (isL3) {
      l3AllIssuesMap.push({
        key: issue.key,
        summary,
        sp: currentSp,
        status,
        done: DONE_SET_LC.has(status.toLowerCase()),
      })
      if (plannedAtStart) {
        initialIssues.push({ key: issue.key, summary, sp: initialSp, status })
      }
      continue
    }

    initialCommitment += initialSp
    currentScope += currentSp

    if (plannedAtStart) {
      initialIssues.push({ key: issue.key, summary, sp: initialSp, status })
    }

    const delta = currentSp - initialSp
    if (delta !== 0) {
      changes.push({
        key: issue.key,
        summary,
        type: !plannedAtStart ? 'added' : delta > 0 ? 'sp_increased' : 'sp_decreased',
        initialSp,
        currentSp,
        delta,
        status,
      })
    }
  }

  // Sort initial issues: by project key alphabetically, then by issue number numerically
  initialIssues.sort((a, b) => {
    const [aPrj, aNum] = a.key.split('-')
    const [bPrj, bNum] = b.key.split('-')
    const prjCmp = aPrj.localeCompare(bPrj)
    if (prjCmp !== 0) return prjCmp
    return parseInt(aNum, 10) - parseInt(bNum, 10)
  })

  // Sort L3 issues: open first, then by SP desc
  l3AllIssuesMap.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.sp - a.sp
  })

  // Sort scope changes: added first, then actualizadas by |delta|
  changes.sort((a, b) => {
    if (a.type === 'added' && b.type !== 'added') return -1
    if (a.type !== 'added' && b.type === 'added') return 1
    return Math.abs(b.delta) - Math.abs(a.delta)
  })

  const l3DoneIssues = l3AllIssuesMap.filter((i) => i.done)
  const l3DoneSp = l3DoneIssues.reduce((sum, i) => sum + i.sp, 0)
  const l3TotalSp = l3AllIssuesMap.reduce((sum, i) => sum + i.sp, 0)

  return {
    sprintId: config.sprintId,
    sprintName: sprint.name ?? `Sprint ${config.sprintId}`,
    sprintStart: sprint.startDate,
    initialCommitment,
    currentScope,
    scopeDelta: currentScope - initialCommitment,
    changes,
    initialIssues,
    l3DoneIssues,
    l3AllIssues: l3AllIssuesMap,
    l3DoneSp,
    l3TotalSp,
  }
}
