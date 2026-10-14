/** Teams whose name appears as a word in Jira sprint titles. Configured via BURNUP_TEAMS in .env. */
export interface BurnupTeam {
  id: string
  label: string
  boardId: number
}

export interface AppConfig {
  jiraBaseUrl: string
  teams: BurnupTeam[]
}

export function jiraIssueUrl(jiraBaseUrl: string, key: string): string {
  return `${jiraBaseUrl}/browse/${key}`
}
