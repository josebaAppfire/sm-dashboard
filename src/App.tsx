import { useCallback, useEffect, useRef, useState } from 'react'
import CycleTimeChart from './components/CycleTimeChart'
import SprintTotals from './components/SprintTotals'
import { type DateRange, toIsoDate } from './components/DateRangePicker'
import VelocityPanel from './components/VelocityPanel'
import PlanningCalculator from './components/PlanningCalculator'
import ScopeChangesPanel from './components/ScopeChangesPanel'
import InitialIssuesPanel from './components/InitialIssuesPanel'
import LanguageSelector from './components/LanguageSelector'
import { fetchAppConfig, fetchBurnup, fetchCycleTime, fetchSprints, fetchJiraSprints, fetchEpics, fetchScopeChanges } from './lib/api'
import { type AppConfig } from './lib/teams'
import { epicDisplayName, useI18n } from './i18n/I18nContext'
import { type BurnupResponse, type CycleTimeResponse, type SprintRecord, type JiraSprintOption, type EpicOption, type ScopeChangesResponse } from './lib/types'

type Tab = 'burnup' | 'velocity' | 'planning'

function defaultCycleRange(): DateRange {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth() - 3, to.getDate())
  return { from: toIsoDate(from), to: toIsoDate(to) }
}

type CycleTimeState =
  | { status: 'idle' }
  | { status: 'loading'; previous?: CycleTimeResponse }
  | { status: 'ok'; data: CycleTimeResponse }
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
  const { t, dateLocale } = useI18n()
  const TABS: { id: Tab; label: string }[] = [
    { id: 'velocity', label: t('tabs.velocity') },
    { id: 'planning', label: t('tabs.planning') },
    { id: 'burnup', label: t('tabs.burnup') },
  ]

  const [tab, setTab] = useState<Tab>('velocity')
  const [cycleTime, setCycleTime] = useState<CycleTimeState>({ status: 'idle' })
  const [cycleRange, setCycleRange] = useState<DateRange>(defaultCycleRange)
  const cycleRequestRef = useRef(0)
  const [sprintTotals, setSprintTotals] = useState<BurnupResponse['totals'] | null>(null)
  const totalsRequestRef = useRef(0)
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

  async function loadCycleTime(epicKeys?: string[], range = cycleRange) {
    const requestId = ++cycleRequestRef.current
    setCycleTime((prev) => ({
      status: 'loading',
      previous: prev.status === 'ok' ? prev.data : prev.status === 'loading' ? prev.previous : undefined,
    }))
    try {
      const data = await fetchCycleTime(range.from, range.to, selectedTeam || undefined, epicKeys)
      if (requestId === cycleRequestRef.current) setCycleTime({ status: 'ok', data })
    } catch (err) {
      if (requestId === cycleRequestRef.current) {
        setCycleTime({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  async function loadSprintTotals(sprintId: number | undefined, epicKeys: string[]) {
    const requestId = ++totalsRequestRef.current
    setSprintTotals(null)
    try {
      const data = await fetchBurnup(sprintId, epicKeys)
      if (requestId === totalsRequestRef.current) setSprintTotals(data.totals)
    } catch {
      // Cards stay empty; the sprint panels below surface Jira errors.
    }
  }

  function handleCycleRangeChange(range: DateRange) {
    setCycleRange(range)
    loadCycleTime(selectedEpicKeys.size > 0 ? [...selectedEpicKeys] : [], range)
  }

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
    setSelectedEpicKeys(new Set())
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
    loadCycleTime([])
  }, [appConfig, selectedTeam, loadJiraSprintsForTeam]) // eslint-disable-line react-hooks/exhaustive-deps

  const teams = appConfig?.teams ?? []
  const jiraBaseUrl = appConfig?.jiraBaseUrl ?? ''

  useEffect(() => {
    if (selectedSprintId !== null) {
      if (selectedEpicKeys.size > 0) loadCycleTime([])
      setSelectedEpicKeys(new Set())
      loadSprintTotals(selectedSprintId, [])
      loadEpics(selectedSprintId)
      loadScopeChanges(selectedSprintId)
    }
  }, [selectedSprintId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = burnupLeftRef.current
    const hasChart = cycleTime.status === 'ok' || (cycleTime.status === 'loading' && !!cycleTime.previous)
    if (!el || tab !== 'burnup' || !hasChart) {
      setBurnupBlockHeight(undefined)
      return
    }
    const sync = () => setBurnupBlockHeight(el.getBoundingClientRect().height)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab, cycleTime])

  const sprints = sprintsState.status === 'ok' ? sprintsState.data : []
  const jiraSprints = jiraSprintsState.status === 'ok' ? jiraSprintsState.data : []
  const epics = epicsState.status === 'ok' ? epicsState.data : []

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }) : ''

  function toggleEpic(key: string) {
    setSelectedEpicKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      loadCycleTime(next.size > 0 ? [...next] : [])
      loadSprintTotals(selectedSprintId ?? undefined, [...next])
      return next
    })
  }

  function handleClearEpicFilter() {
    setSelectedEpicKeys(new Set())
    loadCycleTime([])
    loadSprintTotals(selectedSprintId ?? undefined, [])
  }

  function handleApplyEpicFilter() {
    void loadJiraSprintsForTeam(selectedTeam, true)
    loadCycleTime(selectedEpicKeys.size > 0 ? [...selectedEpicKeys] : [])
    loadSprintTotals(selectedSprintId ?? undefined, [...selectedEpicKeys])
    if (selectedSprintId !== null) {
      loadEpics(selectedSprintId)
      loadScopeChanges(selectedSprintId)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111' }}>
      <div style={{
        borderBottom: '1px solid #e5e7eb', padding: '0 24px',
        display: 'flex', alignItems: 'center', background: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'system-ui', marginRight: 32, padding: '14px 0' }}>
          {t('app.title')}
        </span>
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            style={{
              padding: '14px 16px', fontSize: 14, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'system-ui',
              borderBottom: tab === tabItem.id ? '2px solid #1a73e8' : '2px solid transparent',
              color: tab === tabItem.id ? '#1a73e8' : '#555',
              fontWeight: tab === tabItem.id ? 600 : 400,
            }}
          >
            {tabItem.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <LanguageSelector />
          {tab === 'burnup' && (
            <>
              {teams.length > 0 && (
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  disabled={jiraSprintsState.status === 'loading'}
                  style={selectStyle}
                  aria-label={t('burnup.teamAria')}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.label}</option>
                  ))}
                </select>
              )}
              <select
                value={selectedSprintId ?? ''}
                onChange={(e) => setSelectedSprintId(e.target.value ? Number(e.target.value) : null)}
                disabled={jiraSprintsState.status === 'loading'}
                style={{ ...selectStyle, minWidth: 220 }}
                aria-label={t('burnup.sprintAria')}
              >
                {jiraSprintsState.status === 'loading' && (
                  <option value="">{t('burnup.loadingSprints')}</option>
                )}
                {jiraSprintsState.status === 'error' && (
                  <option value="">{t('burnup.sprintFromEnv')}</option>
                )}
                {jiraSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.state === 'active' ? t('burnup.currentSprint') : ''}{s.name}
                    {s.startDate ? `  (${fmtDate(s.startDate)} → ${fmtDate(s.endDate)})` : ''}
                  </option>
                ))}
                {jiraSprintsState.status === 'ok' && jiraSprints.length === 0 && (
                  <option value="">{t('burnup.noSprintsForTeam')}</option>
                )}
              </select>
              <button
                onClick={handleApplyEpicFilter}
                disabled={cycleTime.status === 'loading'}
                style={selectStyle}
              >
                {cycleTime.status === 'loading' ? t('common.loading') : t('common.refresh')}
              </button>
            </>
          )}
        </div>
      </div>

      {tab === 'burnup' && epics.length > 0 && (
        <div style={{
          padding: '8px 24px', borderBottom: '1px solid #f3f4f6',
          background: '#fafafa', display: 'flex', alignItems: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'system-ui', whiteSpace: 'nowrap', marginRight: 4 }}>
            {t('burnup.filterEpic')}
          </span>
          <button
            onClick={handleClearEpicFilter}
            style={chipStyle(selectedEpicKeys.size === 0, false)}
          >
            {t('burnup.allEpics')}
          </button>
          {epics.map((epic) => (
            <button
              key={epic.key}
              onClick={() => toggleEpic(epic.key)}
              title={epic.key}
              style={chipStyle(selectedEpicKeys.has(epic.key), true)}
            >
              {epicDisplayName(epic, t)}
            </button>
          ))}
          {epicsState.status === 'loading' && (
            <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'system-ui' }}>
              {t('burnup.loadingEpics')}
            </span>
          )}
        </div>
      )}

      <main>
        {tab === 'burnup' && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '0 24px 0 0',
              marginBottom: 16,
            }}>
              <div ref={burnupLeftRef} style={{ flex: '1 1 0', minWidth: 0 }}>
                {cycleTime.status === 'loading' && !cycleTime.previous && <LoadingMsg text={t('burnup.loadingJira')} />}
                {cycleTime.status === 'error' && <ErrorMsg message={cycleTime.message} />}
                {(cycleTime.status === 'ok' || (cycleTime.status === 'loading' && cycleTime.previous)) && (
                  <div style={{ opacity: cycleTime.status === 'loading' ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                    <CycleTimeChart
                      data={cycleTime.status === 'ok' ? cycleTime.data : cycleTime.previous!}
                      jiraBaseUrl={jiraBaseUrl}
                      range={cycleRange}
                      onRangeChange={handleCycleRangeChange}
                    />
                  </div>
                )}
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
                <SprintTotals totals={sprintTotals} />
                {scopeState.status === 'ok'
                  ? (
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <InitialIssuesPanel issues={scopeState.data.initialIssues} jiraBaseUrl={jiraBaseUrl} />
                    </div>
                  )
                  : (
                    <div style={{
                      flex: 1,
                      minHeight: 0,
                      border: '1px dashed #e2e8f0', borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#9ca3af', fontFamily: 'system-ui',
                    }}>
                      {scopeState.status === 'loading' ? t('burnup.loadingInitialPlan') : ''}
                    </div>
                  )
                }
              </div>
            </div>

            {scopeState.status === 'loading' && (
              <div style={{ padding: '12px 24px', fontSize: 13, color: '#9ca3af', fontFamily: 'system-ui' }}>
                {t('burnup.calculatingScope')}
              </div>
            )}
            {scopeState.status === 'ok' && <ScopeChangesPanel data={scopeState.data} jiraBaseUrl={jiraBaseUrl} />}
            {scopeState.status === 'error' && (
              <div style={{ margin: '0 24px 16px', fontSize: 12, color: '#b91c1c', fontFamily: 'system-ui' }}>
                {t('burnup.scopeError')} {scopeState.message}
              </div>
            )}
          </>
        )}

        <div style={{ display: tab === 'velocity' ? 'block' : 'none' }}>
          {sprintsState.status === 'loading'
            ? <LoadingMsg text={t('burnup.loadingSprints')} />
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

const selectStyle: React.CSSProperties = {
  fontSize: 13, padding: '5px 8px', borderRadius: 6,
  border: '1px solid #d1d5db', background: '#fff', color: '#374151',
  cursor: 'pointer',
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
  const { t } = useI18n()
  return (
    <div style={{
      margin: 32, padding: 20, borderRadius: 8,
      background: '#fef2f2', border: '1px solid #fca5a5', fontFamily: 'system-ui',
    }}>
      <strong style={{ color: '#b91c1c' }}>{t('common.error')}</strong>
      <pre style={{ marginTop: 8, fontSize: 13, color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>
        {message}
      </pre>
      <p style={{ fontSize: 13, color: '#555', marginTop: 12 }}>
        {t('app.errorHint')}
      </p>
    </div>
  )
}
