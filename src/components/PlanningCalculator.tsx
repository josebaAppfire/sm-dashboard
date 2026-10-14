import { useEffect, useState } from 'react'
import { type SprintRecord, type PlanningResult } from '../lib/types'
import { fetchPlanning } from '../lib/api'

interface Props {
  sprints: SprintRecord[]
}

function calcDevDays(devsWithDays: { days: number; absences: number }[], sprintDays: number) {
  return devsWithDays.reduce((sum, d) => sum + (d.days > 0 ? d.days : sprintDays) - d.absences, 0)
}

export default function PlanningCalculator({ sprints }: Props) {
  const referenceCandidates = sprints.filter(
    (s) => s.delivered != null && s.devDays != null
  )

  const defaultRef = referenceCandidates[referenceCandidates.length - 1]?.id ?? ''

  const [sprintDays, setSprintDays] = useState(10)
  const [teamSize, setTeamSize] = useState(6)      // total devs in team (for theoretical max)
  const [referenceId, setReferenceId] = useState(defaultRef)
  const [devCount, setDevCount] = useState(6)
  const [devRows, setDevRows] = useState<{ days: number; absences: number }[]>(
    Array.from({ length: 6 }, () => ({ days: 0, absences: 0 }))
  )
  const [result, setResult] = useState<PlanningResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goalPlanned, setGoalPlanned] = useState<number | ''>('')
  const [goalRelated, setGoalRelated] = useState<number | ''>('')

  // Sync devRows length when devCount changes
  useEffect(() => {
    setDevRows((prev) => {
      if (devCount > prev.length) {
        return [...prev, ...Array.from({ length: devCount - prev.length }, () => ({ days: 0, absences: 0 }))]
      }
      return prev.slice(0, devCount)
    })
  }, [devCount])

  useEffect(() => {
    if (defaultRef && !referenceId) setReferenceId(defaultRef)
  }, [defaultRef, referenceId])

  const devDays = calcDevDays(devRows, sprintDays)
  const theoreticalMax = teamSize * sprintDays
  const theoreticalPct = theoreticalMax > 0 ? devDays / theoreticalMax : 0

  const goalPct =
    typeof goalPlanned === 'number' &&
    typeof goalRelated === 'number' &&
    goalPlanned > 0 &&
    goalRelated <= goalPlanned
      ? Math.round((goalRelated / goalPlanned) * 100)
      : null

  async function handleCalculate() {
    if (!referenceId) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetchPlanning(devDays, referenceId)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function updateDevRow(i: number, field: 'days' | 'absences', val: string) {
    const n = val === '' ? 0 : Number(val)
    setDevRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: n } : r))
  }

  return (
    <div style={{ padding: '24px', maxWidth: 860, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 600 }}>Calculadora de Planning</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#666' }}>
        Calcula el techo de SP y el reparto cubeta A / cubeta B para el próximo sprint.
      </p>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Left: inputs */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FormRow label="Sprint de referencia"
            hint="Último sprint comparable con días-persona registrados">
            <select value={referenceId} onChange={(e) => setReferenceId(e.target.value)} style={inputStyle}>
              <option value="">— Seleccionar —</option>
              {referenceCandidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.delivered} SP entregados ({s.devDays} días-persona)
                </option>
              ))}
            </select>
            {referenceCandidates.length === 0 && (
              <span style={{ fontSize: 12, color: '#d97706' }}>
                Ningún sprint tiene días-persona registrados. Edítalos en el panel de Velocidad.
              </span>
            )}
          </FormRow>

          <div style={{ display: 'flex', gap: 12 }}>
            <FormRow label="Días laborables del sprint">
              <input type="number" value={sprintDays} min={1} max={30} style={{ ...inputStyle, width: 80 }}
                onChange={(e) => setSprintDays(Number(e.target.value))} />
            </FormRow>
            <FormRow label="Devs en el equipo (total)"
              hint="Para capacidad teórica máxima">
              <input type="number" value={teamSize} min={1} max={30} style={{ ...inputStyle, width: 80 }}
                onChange={(e) => setTeamSize(Math.max(1, Number(e.target.value)))} />
            </FormRow>
          </div>

          <FormRow label="Devs disponibles este sprint">
            <input type="number" value={devCount} min={1} max={20} style={{ ...inputStyle, width: 80 }}
              onChange={(e) => setDevCount(Math.max(1, Number(e.target.value)))} />
          </FormRow>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Disponibilidad por dev
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              Deja "días propios" en 0 para usar los días del sprint. "Ausencias" = días de baja/vacaciones.
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>Dev</th>
                  <th style={thStyle}>Días propios (0 = sprint)</th>
                  <th style={thStyle}>Ausencias (días)</th>
                  <th style={thStyle}>Neto</th>
                </tr>
              </thead>
              <tbody>
                {devRows.map((row, i) => {
                  const net = (row.days > 0 ? row.days : sprintDays) - row.absences
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '4px 8px', color: '#555' }}>Dev {i + 1}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" value={row.days || ''} min={0} style={{ ...inputStyle, width: 70 }}
                          onChange={(e) => updateDevRow(i, 'days', e.target.value)} placeholder="0" />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" value={row.absences || ''} min={0} style={{ ...inputStyle, width: 70 }}
                          onChange={(e) => updateDevRow(i, 'absences', e.target.value)} placeholder="0" />
                      </td>
                      <td style={{ padding: '4px 8px', fontWeight: 600, color: net <= 0 ? '#ef4444' : '#111' }}>
                        {net}d
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                  <td colSpan={3} style={{ padding: '6px 8px', fontWeight: 600, fontSize: 13 }}>
                    Total días-persona disponibles
                  </td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, fontSize: 14 }}>{devDays}d</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ padding: '2px 8px', fontSize: 12, color: '#888' }}>
                    Máximo teórico ({teamSize} devs × {sprintDays} días)
                  </td>
                  <td style={{ padding: '2px 8px', fontSize: 12, color: '#888' }}>{theoreticalMax}d</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading || !referenceId || devDays <= 0}
            style={{
              padding: '9px 20px', fontSize: 14, fontWeight: 600, borderRadius: 7,
              background: '#1a73e8', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: (!referenceId || devDays <= 0) ? 0.5 : 1,
            }}
          >
            {loading ? 'Calculando…' : 'Calcular techo'}
          </button>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        {/* Right: result + goal calculator */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result && (
            <ResultPanel
              result={result}
              devDays={devDays}
              theoreticalMax={theoreticalMax}
              theoreticalPct={theoreticalPct}
            />
          )}

          {/* Goal % calculator — always visible */}
          <div style={{
            border: '1px solid #e2e8f0', borderRadius: 10,
            padding: 20, background: '#f8fafc',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              % SP orientados a goals
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Calcula qué porcentaje de los SP planificados están vinculados a los goals del sprint.
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                  SP planificados (100%)
                </label>
                <input
                  type="number"
                  value={goalPlanned}
                  min={1}
                  style={{ ...inputStyle, width: 100 }}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                    setGoalPlanned(v as number | '')
                    // clamp goalRelated if needed
                    if (typeof goalRelated === 'number' && typeof v === 'number' && goalRelated > v) {
                      setGoalRelated(v)
                    }
                  }}
                  placeholder="ej. 30"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                  SP goal related
                </label>
                <input
                  type="number"
                  value={goalRelated}
                  min={0}
                  max={typeof goalPlanned === 'number' ? goalPlanned : undefined}
                  style={{
                    ...inputStyle, width: 100,
                    borderColor:
                      typeof goalRelated === 'number' &&
                      typeof goalPlanned === 'number' &&
                      goalRelated > goalPlanned
                        ? '#f87171' : '#d1d5db',
                  }}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                    setGoalRelated(v as number | '')
                  }}
                  placeholder="ej. 18"
                />
                {typeof goalRelated === 'number' &&
                  typeof goalPlanned === 'number' &&
                  goalRelated > goalPlanned && (
                  <span style={{ fontSize: 11, color: '#b91c1c' }}>
                    No puede superar los SP planificados
                  </span>
                )}
              </div>

              {/* Result badge */}
              {goalPct !== null && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #bbf7d0', borderRadius: 8,
                  padding: '8px 18px', background: '#f0faf2', minWidth: 80,
                }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: '#137333', lineHeight: 1 }}>
                    {goalPct}%
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
                    goal related
                  </span>
                </div>
              )}
            </div>

            {goalPct !== null && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
                Fórmula: {goalRelated} ÷ {goalPlanned} × 100 = <strong>{goalPct}%</strong> de los SP están orientados a goals
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


function ResultPanel({
  result,
  devDays,
  theoreticalMax,
  theoreticalPct,
}: {
  result: PlanningResult
  devDays: number
  theoreticalMax: number
  theoreticalPct: number
}) {
  const refPct = Math.round(result.capacityPct * 100)
  const theoPct = Math.round(theoreticalPct * 100)

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
        Resultado — sprint vs. {result.referenceSprintId}
      </div>

      <FormulaLine
        label="Referencia"
        value={`${result.referenceDelivered} SP`}
        sub={`${result.referenceSprintId} · ${result.referenceDevDays} días-persona`}
      />
      <FormulaLine
        label="Días-persona disponibles"
        value={`${devDays} d`}
        sub={`de ${theoreticalMax} posibles (${devDays} ÷ ${theoreticalMax})`}
      />

      <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0 8px' }} />

      {/* Two capacity percentages, side by side */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <CapacityBadge
          label="Capacidad histórica"
          sub={`vs. ${result.referenceSprintId}`}
          pct={refPct}
          tip={`${devDays} ÷ ${result.referenceDevDays}`}
        />
        <CapacityBadge
          label="Capacidad teórica"
          sub={`${devDays} ÷ ${theoreticalMax} d`}
          pct={theoPct}
          tip="vs. equipo al completo"
          dimColor
        />
      </div>

      <div style={{
        fontSize: 11, color: '#6b7280', padding: '6px 8px',
        background: '#f1f5f9', borderRadius: 5, marginBottom: 12,
      }}>
        <strong>Histórica</strong> → escala la velocidad real. Úsala para calcular el techo de SP.<br />
        <strong>Teórica</strong> → porcentaje del equipo disponible. Ponla en Confluence para el PO.
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />
      <FormulaLine label="Techo calculado" value={`${result.ceiling} SP`} big />
      <FormulaLine label="Compromiso conservador" value={`${result.conservative} SP`} sub="Recomendado para Planning (−8%)" />
      <div style={{ marginTop: 12, padding: '8px 10px', background: '#fff', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: '#555' }}>
        <strong>Fórmula techo:</strong>{' '}
        {devDays} ÷ {result.referenceDevDays} = {result.capacityPct.toFixed(2)} × {result.referenceDelivered} SP = <strong>{result.ceiling} SP</strong>
      </div>
    </div>
  )
}

function CapacityBadge({
  label, sub, pct, tip, dimColor,
}: {
  label: string; sub: string; pct: number; tip: string; dimColor?: boolean
}) {
  const color = dimColor ? '#6b7280' : (pct < 70 ? '#d97706' : pct > 100 ? '#d97706' : '#137333')
  const bg = dimColor ? '#f8fafc' : (pct < 70 ? '#fffbeb' : '#f0faf2')
  const border = dimColor ? '#e2e8f0' : (pct < 70 ? '#fde68a' : '#bbf7d0')
  return (
    <div style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px', background: bg }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{pct}%</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{tip}</div>
    </div>
  )
}

function FormulaLine({
  label, value, sub, big,
}: {
  label: string; value: string; sub?: string; big?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
      <div>
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: big ? 22 : 15, fontWeight: big ? 700 : 600, color: '#111' }}>
        {value}
      </span>
    </div>
  )
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 12 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px', fontSize: 13, border: '1px solid #d1d5db',
  borderRadius: 5, outline: 'none', boxSizing: 'border-box',
}

const thStyle: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'left', color: '#6b7280', fontWeight: 500,
}
