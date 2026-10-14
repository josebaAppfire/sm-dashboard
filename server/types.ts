// ---- Sprint store types ----

export type HealthColor = 'green' | 'yellow' | 'red' | null

export interface SprintHealth {
  procesoScrum?: HealthColor
  claridadObjetivos?: HealthColor
  colaboracion?: HealthColor
  calidadTecnica?: HealthColor
  velocidadFoco?: HealthColor
  aprendizaje?: HealthColor
  comunicacion?: HealthColor
  diversionEnergia?: HealthColor
}

export interface SprintRecord {
  id: string                  // e.g. "Q3-3"
  jiraSprintId: number | null
  startDate: string | null    // ISO date
  endDate: string | null      // ISO date
  committed: number | null    // SP committed at Planning
  delivered: number | null    // SP delivered (Done + WfR)
  scope: number | null        // final scope (may differ from committed due to scope creep)
  devs: number | null         // devs in sprint
  devDays: number | null      // total dev-days available
  bucketA: number | null      // SP Cubeta A (planned work)
  bucketB: number | null      // SP Cubeta B (fixes/prod)
  context: string             // free text notes
  health: SprintHealth        // squad health check results
}

export interface PlanningResult {
  referenceSprintId: string
  referenceDelivered: number
  referenceDevDays: number
  inputDevDays: number
  capacityPct: number         // 0–1
  ceiling: number
  conservative: number
  bucketB: number
  bucketA: number
}

// ---- Scope changes ----

export interface ScopeChange {
  key: string
  summary: string
  type: 'added' | 'sp_increased' | 'sp_decreased'
  initialSp: number
  currentSp: number
  delta: number
  status: string
}

export interface InitialIssue {
  key: string
  summary: string
  sp: number
  status: string
}

export interface L3SupportIssue {
  key: string
  summary: string
  sp: number
  status: string
  done: boolean           // true if Done or Waiting for Release
}

export interface ScopeChangesResponse {
  sprintId: number
  sprintName: string
  sprintStart: string     // ISO
  initialCommitment: number
  currentScope: number
  scopeDelta: number      // currentScope - initialCommitment
  changes: ScopeChange[]
  initialIssues: InitialIssue[]    // issues present at sprint start
  l3DoneIssues: L3SupportIssue[]   // kept for compatibility (filtered view)
  l3AllIssues: L3SupportIssue[]    // all L3 Support issues in sprint
  l3DoneSp: number                 // SP of Done + WfR L3 issues
  l3TotalSp: number                // SP of all L3 issues in sprint
}

// ---- Epic filter ----

export interface EpicOption {
  key: string   // e.g. "PROJ-10"
  name: string  // epic summary
}

// ---- Jira sprint selector ----

export interface JiraSprintOption {
  id: number
  name: string
  state: 'active' | 'closed' | 'future'
  startDate?: string
  endDate?: string
}

// ---- Burnup types ----

// Types shared between server and client via the /api/burnup response shape.
export interface SprintMeta {
  id: number
  name: string
  startDate: string
  endDate: string
  state: 'active' | 'closed' | 'future'
}

export interface BurnupPoint {
  date: string       // ISO datetime string (moment in the sprint)
  scope: number      // total SP committed to sprint at this point
  completed: number  // SP reached Done status
}

export interface BurnupResponse {
  sprint: SprintMeta
  series: BurnupPoint[]
  totals: {
    scope: number
    completed: number
    completedIncludingWfR: number  // Done + Waiting for Release
  }
  dataSource: 'rest'
  warning?: string
}

