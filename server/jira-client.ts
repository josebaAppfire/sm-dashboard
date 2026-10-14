import 'dotenv/config'

const required = (key: string): string => {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env var: ${key}. Copy .env.example → .env and fill in the values.`)
  return v
}

export function getConfig() {
  return {
    baseUrl: required('JIRA_BASE_URL'),
    email: required('JIRA_EMAIL'),
    token: required('JIRA_API_TOKEN'),
    boardId: Number(process.env.BOARD_ID ?? '0'),
    sprintId: Number(process.env.SPRINT_ID ?? '0'),
    estimateField: process.env.ESTIMATE_FIELD ?? 'customfield_10016',
    port: Number(process.env.PORT ?? '3001'),
  }
}

export type Config = ReturnType<typeof getConfig>

function authHeader(email: string, token: string): string {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
}

export function jiraFetch(
  config: Config,
  path: string,
  params?: Record<string, string | number>
): Promise<Response> {
  const url = new URL(config.baseUrl + path)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
  }
  return fetch(url.toString(), {
    headers: {
      Authorization: authHeader(config.email, config.token),
      Accept: 'application/json',
    },
  })
}

export interface BoardSprint {
  id: number
  name: string
  state: string
  startDate?: string
  endDate?: string
}

/** All active and closed sprints of a board. */
export async function fetchBoardSprints(config: Config, boardId: number): Promise<BoardSprint[]> {
  const all: BoardSprint[] = []
  let startAt = 0
  let isLast = false
  while (!isLast) {
    const r = await jiraFetch(config, `/rest/agile/1.0/board/${boardId}/sprint`, {
      state: 'active,closed',
      maxResults: 50,
      startAt,
    })
    if (!r.ok) throw new Error(`Jira returned ${r.status}`)
    const page = (await r.json()) as { values: BoardSprint[]; isLast: boolean }
    all.push(...page.values)
    isLast = page.isLast || page.values.length === 0
    startAt += page.values.length
  }
  return all
}
