import { useCallback, useEffect, useRef, useState } from 'react'
import BurnupChart from './components/BurnupChart'
import VelocityPanel from './components/VelocityPanel'
import PlanningCalculator from './components/PlanningCalculator'
import ScopeChangesPanel from './components/ScopeChangesPanel'
import InitialIssuesPanel from './components/InitialIssuesPanel'
import { fetchAppConfig, fetchBurnup, fetchSprints, fetchJiraSprints, fetchEpics, fetchScopeChanges } from './lib/api'
import { type AppConfig } from './lib/teams'
import { type BurnupResponse, type SprintRecord, type JiraSprintOption, type EpicOption, type ScopeChangesResponse } from './lib/types'

type Tab = 'burnup' | 'velocity' | 'planning'

const TABS: { id: Tab; label: string }[] = [
  { id: 'velocity', label: 'Velocidad' },
  { id: 'planning', label: 'Planning' },
  { id: 'burnup', label: 'Burnup' },
]

type BurnupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: BurnupResponse }
  | { status: 'error'; message: string }

type SprintsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: SprintRecord[] }
  | { status: 'error'; message: string }

type JiraSprintsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: JiraSprintOption[] }
  | { status: 'error'; message: string }

type EpicsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: EpicOption[] }
  | { status: 'error' }

type ScopeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: ScopeChangesResponse }
  | { status: 'error'; message: string }

export default function App() {
  const [tab, setTab] = useState<Tab>('velocity')
  const [burnup, setBurnup] = useState<BurnupState>({ status: 'idle' })
  const [sprintsState, setSprintsState] = useState<SprintsState>({ status: 'idle' })
  const [jiraSprintsState, setJiraSprintsState] = useState<JiraSprintsState>({ status: 'idle' })
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null)
  const [epicsState, setEpicsState] = useState<EpicsState>({ status: 'idle' })
  const [selectedEpicKeys, setSelectedEpicKeys] = useState<Set<string>>(new Set())
  const [scopeState, setScopeState] = useState<ScopeState>({ status: 'idle' })
  const burnupLeftRef = useRef<HTMLDivElement>(null)
  const [burnupBlockHeight, setBurnupBlockHeight] = useState<number | undefined>(undefined)

  const loadBurnup = useCallback(async (sprintId?: number, epicKeys?: string[]) => {
    setBurnup({ status: 'loading' })
    try {
      const data = await fetchBurnup(undefined, sprintId, epicKeys)
      setBurnup({ status: 'ok', data })
    } catch (err) {
      setBurnup({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const loadSprints = useCallback(async () => {
    setSprintsState({ status: 'loading' })
    try {
      const data = await fetchSprints()
      setSprintsState({ status: 'ok', data })
    } catch (err) {
      setSprintsState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const loadJiraSprintsForTeam = useCallback(async (team: string, preserveSelection: boolean) => {
    setJiraSprintsState({ status: 'loading' })
    try {
      const data = await fetchJiraSprints(undefined, team || undefined, 5)
      setJiraSprintsState({ status: 'ok', data })
      if (!preserveSelection && data.length > 0) {
        const active = data.find((s) => s.state === 'active')
        setSelectedSprintId(active?.id ?? data[0].id)
      }
    } catch (err) {
      setJiraSprintsState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const loadEpics = useCallback(async (sprintId: number) => {
    setEpicsState({ status: 'loading' })
    setSelectedEpicKeys(new Set()) // reset selection when sprint changes
    try {
      const data = await fetchEpics(sprintId)
      setEpicsState({ status: 'ok', data })
    } catch {
      setEpicsState({ status: 'error' })
    }
  }, [])

  const loadScopeChanges = useCallback(async (sprintId: number) => {
    setScopeState({ status: 'loading' })
    try {
      const data = await fetchScopeChanges(sprintId)
      setScopeState({ status: 'ok', data })
    } catch (err) {
      setScopeState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  useEffect(() => { loadBurnup() }, [loadBurnup])
  useEffect(() => { loadSprints() }, [loadSprints])
  useEffect(() => {
    fetchAppConfig()
      .then((config) => {
        setAppConfig(config)
        setSelectedTeam(config.teams[0]?.id ?? '')
      })
      .catch(() => setAppConfig({ jiraBaseUrl: '', teams: [] }))
  }, [])
  useEffect(() => {
    if (appConfig === null) return
    void loadJiraSprintsForTeam(selectedTeam, false)
  }, [appConfig, selectedTeam, loadJiraSprintsForTeam])

  const teams = appConfig?.teams ?? []
  const jiraBaseUrl = appConfig?.jiraBaseUrl ?? ''

  // When sprint changes: reload burnup + epics + scope changes
  useEffect(() => {
    if (selectedSprintId !== null) {
      setSelectedEpicKeys(new Set())
      loadBurnup(selectedSprintId, [])
      loadEpics(selectedSprintId)
      loadScopeChanges(selectedSprintId)
    }
  }, [selectedSprintId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Match right planning table height to the burnup chart block (left column)
  useEffect(() => {
    const el = burnupLeftRef.current
    if (!el || tab !== 'burnup' || burnup.status !== 'ok') {
      setBurnupBlockHeight(undefined)
      return
    }
    const sync = () => setBurnupBlockHeight(el.getBoundingClientRect().height)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab, burnup])

  const sprints = sprintsState.status === 'ok' ? sprintsState.data : []
  const jiraSprints = jiraSprintsState.status === 'ok' ? jiraSprintsState.data : []
  const epics = epicsState.status === 'ok' ? epicsState.data : []

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

  function toggleEpic(key: string) {
    setSelectedEpicKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      loadBurnup(
        selectedSprintId ?? undefined,
        next.size > 0 ? [...next] : []
      )
      return next
    })
  }

  function handleClearEpicFilter() {
    setSelectedEpicKeys(new Set())
    loadBurnup(selectedSprintId ?? undefined, [])
  }

  function handleApplyEpicFilter() {
    // Refresh sprint list for current team; burnup/epics/scope use sprint id (any team)
    void loadJiraSprintsForTeam(selectedTeam, true)
    if (selectedSprintId !== null) {
      loadBurnup(selectedSprintId, selectedEpicKeys.size > 0 ? [...selectedEpicKeys] : [])
      loadEpics(selectedSprintId)
      loadScopeChanges(selectedSprintId)
    } else {
      loadBurnup(undefined, [])
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111' }}>
      {/* Top bar */}
      <div style={{
        borderBottom: '1px solid #e5e7eb', padding: '0 24px',
        display: 'flex', alignItems: 'center', background: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'system-ui', marginRight: 32, padding: '14px 0' }}>
          SM Dashboard
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '14px 16px', fontSize: 14, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'system-ui',
              borderBottom: tab === t.id ? '2px solid #1a73e8' : '2px solid transparent',
              color: tab === t.id ? '#1a73e8' : '#555',
              fontWeight: tab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />

        {/* Burnup controls — sprint selector + refresh */}
        {tab === 'burnup' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {teams.length > 0 && (
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                disabled={jiraSprintsState.status === 'loading'}
                style={{
                  fontSize: 13, padding: '5px 8px', borderRadius: 6,
                  border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                  cursor: 'pointer',
                }}
                aria-label="Equipo"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
            <select
              value={selectedSprintId ?? ''}
              onChange={(e) => setSelectedSprintId(e.target.value ? Number(e.target.value) : null)}
              disabled={jiraSprintsState.status === 'loading'}
              style={{
                fontSize: 13, padding: '5px 8px', borderRadius: 6,
                border: '1px solid #d1d5db', background: '#fff', color: '#374151',
                minWidth: 220, cursor: 'pointer',
              }}
              aria-label="Sprint"
            >
              {jiraSprintsState.status === 'loading' && <option value="">Cargando sprints…</option>}
              {jiraSprintsState.status === 'error' && <option value="">Sprint del .env</option>}
              {jiraSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.state === 'active' ? '● Actual · ' : ''}{s.name}
                  {s.startDate ? `  (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)})` : ''}
                </option>
              ))}
              {jiraSprintsState.status === 'ok' && jiraSprints.length === 0 && (
                <option value="">Sin sprints para este equipo</option>
              )}
            </select>
            <button
              onClick={handleApplyEpicFilter}
              disabled={burnup.status === 'loading'}
              style={{
                fontSize: 13, padding: '5px 14px', borderRadius: 6,
                border: '1px solid #d1d5db', background: '#fff',
                cursor: burnup.status === 'loading' ? 'not-allowed' : 'pointer',
                color: '#374151',
              }}
            >
              {burnup.status === 'loading' ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
        )}
      </div>

      {/* Epic filter bar — only in burnup tab, only when epics available */}
      {tab === 'burnup' && epics.length > 0 && (
        <div style={{
          padding: '8px 24px', borderBottom: '1px solid #f3f4f6',
          background: '#fafafa', display: 'flex', alignItems: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'system-ui', whiteSpace: 'nowrap', marginRight: 4 }}>
            Filtrar por épica:
          </span>
          {/* "Todas" chip */}
          <button
            onClick={handleClearEpicFilter}
            style={chipStyle(selectedEpicKeys.size === 0, false)}
          >
            Todas
          </button>
          {epics.map((epic) => (
            <button
              key={epic.key}
              onClick={() => toggleEpic(epic.key)}
              title={epic.key}
              style={chipStyle(selectedEpicKeys.has(epic.key), true)}
            >
              {epic.name}
            </button>
          ))}
          {epicsState.status === 'loading' && (
            <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'system-ui' }}>
              Cargando épicas…
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <main>
        {/* Burnup */}
        {tab === 'burnup' && (
          <>
            {/* Chart + initial issues — 50/50, same height */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '0 24px 0 0',
              marginBottom: 16,
            }}>
              <div ref={burnupLeftRef} style={{ flex: '1 1 0', minWidth: 0 }}>
                {burnup.status === 'loading' && <LoadingMsg text="Cargando datos de Jira…" />}
                {burnup.status === 'error' && <ErrorMsg message={burnup.message} />}
                {burnup.status === 'ok' && <BurnupChart data={burnup.data} />}
              </div>
              <div style={{
                flex: '1 1 0',
                minWidth: 0,
                paddingTop: 24,
                height: burnupBlockHeight,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
              }}>
                {scopeState.status === 'ok'
                  ? <InitialIssuesPanel issues={scopeState.data.initialIssues} jiraBaseUrl={jiraBaseUrl} />
                  : (
                    <div style={{
                      flex: 1,
                      minHeight: 0,
                      border: '1px dashed #e2e8f0', borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#9ca3af', fontFamily: 'system-ui',
                    }}>
                      {scopeState.status === 'loading' ? 'Cargando planificación inicial…' : ''}
                    </div>
                  )
                }
              </div>
            </div>

            {/* Scope changes & L3 panels */}
            {scopeState.status === 'loading' && (
              <div style={{ padding: '12px 24px', fontSize: 13, color: '#9ca3af', fontFamily: 'system-ui' }}>
                Calculando cambios de scope…
              </div>
            )}
            {scopeState.status === 'ok' && <ScopeChangesPanel data={scopeState.data} jiraBaseUrl={jiraBaseUrl} />}
            {scopeState.status === 'error' && (
              <div style={{ margin: '0 24px 16px', fontSize: 12, color: '#b91c1c', fontFamily: 'system-ui' }}>
                No se pudo calcular el scope: {scopeState.message}
              </div>
            )}
          </>
        )}

        <div style={{ display: tab === 'velocity' ? 'block' : 'none' }}>
          {sprintsState.status === 'loading'
            ? <LoadingMsg text="Cargando sprints…" />
            : sprintsState.status === 'error'
            ? <ErrorMsg message={sprintsState.message} />
            : <VelocityPanel sprints={sprints} onRefresh={loadSprints} />}
        </div>

        <div style={{ display: tab === 'planning' ? 'block' : 'none' }}>
          <PlanningCalculator sprints={sprints} />
        </div>
      </main>
    </div>
  )
}

function chipStyle(active: boolean, isEpic: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 12,
    border: active ? '1px solid #1a73e8' : '1px solid #d1d5db',
    background: active ? (isEpic ? '#e8f0fe' : '#1a73e8') : '#fff',
    color: active ? (isEpic ? '#1a73e8' : '#fff') : '#374151',
    cursor: 'pointer',
    fontFamily: 'system-ui',
    fontWeight: active ? 600 : 400,
    whiteSpace: 'nowrap' as const,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function LoadingMsg({ text }: { text: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888', fontFamily: 'system-ui' }}>
      {text}
    </div>
  )
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <div style={{
      margin: 32, padding: 20, borderRadius: 8,
      background: '#fef2f2', border: '1px solid #fca5a5', fontFamily: 'system-ui',
    }}>
      <strong style={{ color: '#b91c1c' }}>Error</strong>
      <pre style={{ marginTop: 8, fontSize: 13, color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>
        {message}
      </pre>
      <p style={{ fontSize: 13, color: '#555', marginTop: 12 }}>
        Comprueba que el servidor está en marcha (<code>npm run dev</code>) y que el <code>.env</code> tiene credenciales válidas.
      </p>
    </div>
  )
}
