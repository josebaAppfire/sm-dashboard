import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { patchSprint, saveSprint } from '../lib/api'
import { type AutoVelocitySprint, type SprintRecord } from '../lib/types'
import { sprintLabel } from '../lib/sprintLabel'
import { useI18n } from '../i18n/I18nContext'

interface Props {
  sprints: AutoVelocitySprint[]
  manualByJiraId: Map<number, SprintRecord>
  loading?: boolean
  onRefresh: () => void
}

function rollingAvg(sprints: AutoVelocitySprint[], idx: number, window = 3): number | null {
  const comparable = sprints.slice(0, idx + 1).filter((s) => s.state === 'closed' || s.delivered != null)
  const withDelivered = comparable.filter((s) => s.delivered != null)
  if (withDelivered.length < window) return null
  const last = withDelivered.slice(-window)
  return Math.round(last.reduce((sum, x) => sum + (x.delivered ?? 0), 0) / window)
}

function defaultSprintId(s: AutoVelocitySprint): string {
  const match = s.name.match(/(?:\d{4}-)?(Q\d-\d+)\s*(.*)/i)
  if (match) {
    const suffix = match[2]?.replace(/^Doom:?\s*/i, '').trim()
    return suffix ? `${match[1]} ${suffix}` : match[1]
  }
  return s.name
}

function recordFromAuto(s: AutoVelocitySprint, manual?: SprintRecord): SprintRecord {
  return {
    id: manual?.id ?? defaultSprintId(s),
    jiraSprintId: s.jiraSprintId,
    startDate: manual?.startDate ?? s.startDate?.slice(0, 10) ?? null,
    endDate: manual?.endDate ?? s.endDate?.slice(0, 10) ?? null,
    committed: manual?.committed ?? s.committed,
    delivered: manual?.delivered ?? (s.state === 'closed' ? s.delivered : null),
    scope: manual?.scope ?? s.scope,
    devs: manual?.devs ?? null,
    devDays: manual?.devDays ?? null,
    bucketA: manual?.bucketA ?? null,
    bucketB: manual?.bucketB ?? null,
    context: manual?.context ?? '',
    health: manual?.health ?? {},
  }
}

export default function VelocityPanel({ sprints, manualByJiraId, loading, onRefresh }: Props) {
  const { t } = useI18n()
  const [saveError, setSaveError] = useState<string | null>(null)

  async function saveCapacity(
    s: AutoVelocitySprint,
    field: 'devs' | 'devDays',
    value: number | null
  ) {
    setSaveError(null)
    const manual = manualByJiraId.get(s.jiraSprintId)
    try {
      if (manual) {
        await patchSprint(manual.id, { [field]: value })
      } else {
        await saveSprint({ ...recordFromAuto(s), [field]: value })
      }
      onRefresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  const committedKey = t('velocity.chartCommitted')
  const deliveredKey = t('velocity.chartDelivered')
  const rollingKey = t('velocity.chartRolling')

  const chartData = sprints.map((s, i) => ({
    id: sprintLabel(s),
    [committedKey]: s.committed,
    [deliveredKey]: s.state === 'active' ? null : s.delivered,
    [rollingKey]: rollingAvg(sprints, i),
  }))

  const closed = sprints.filter((s) => s.state === 'closed')
  const lastRef = closed[closed.length - 1]
  const velocidadRef = lastRef?.delivered ?? 0

  const tableHeaders = [
    t('velocity.colSprint'),
    t('velocity.colCommitted'),
    t('velocity.colDelivered'),
    t('velocity.colScope'),
    t('velocity.colDevs'),
    t('velocity.colDevDays'),
    t('velocity.colL3'),
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 960, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{t('velocity.title')}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>{t('velocity.subtitle')}</p>
      </div>

      {loading && sprints.length === 0 && (
        <LoadingBlock text={t('velocity.loading')} />
      )}

      {!loading && sprints.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14 }}>
          {t('velocity.empty')}
        </div>
      )}

      {sprints.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard
              label={t('velocity.refCurrent')}
              value={`${velocidadRef} SP`}
              sub={lastRef ? sprintLabel(lastRef) : t('common.dash')}
              accent
            />
            <StatCard label={t('velocity.totalSprints')} value={String(sprints.length)} />
            <StatCard
              label={t('velocity.rollingAvg')}
              value={
                closed.length >= 3
                  ? `${rollingAvg(sprints, sprints.length - 1) ?? t('common.dash')} SP`
                  : t('common.dash')
              }
              sub={closed.length < 3 ? t('velocity.needThreeSprints') : undefined}
            />
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="id" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: 'Story Points',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 12,
                }}
              />
              <Tooltip formatter={(v: number, n: string) => [`${v} SP`, n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {velocidadRef > 0 && (
                <ReferenceLine
                  y={velocidadRef}
                  stroke="#aaa"
                  strokeDasharray="4 4"
                  label={{
                    value: t('velocity.refLine'),
                    position: 'right',
                    fontSize: 11,
                    fill: '#888',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey={committedKey}
                stroke="#1a73e8"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={deliveredKey}
                stroke="#34a853"
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={rollingKey}
                stroke="#ea4335"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="5 3"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{t('velocity.footnote')}</p>
          {saveError && (
            <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{saveError}</p>
          )}

          <div style={{ marginTop: 28, overflowX: 'auto', opacity: loading ? 0.6 : 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  {tableHeaders.map((h) => (
                    <th key={h} style={{ padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sprints.map((s) => {
                  const manual = manualByJiraId.get(s.jiraSprintId)
                  return (
                    <tr key={s.jiraSprintId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                        {sprintLabel(s)}
                        {s.state === 'active' && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#1a73e8' }}>
                            ({t('velocity.active')})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px' }}>{s.committed}</td>
                      <td style={{ padding: '6px 10px', color: '#137333', fontWeight: 600 }}>
                        {s.state === 'active' ? t('velocity.inProgress') : s.delivered}
                      </td>
                      <td style={{ padding: '6px 10px' }}>{s.scope}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <CapacityInput
                          value={manual?.devs ?? null}
                          disabled={loading}
                          onSave={(v) => saveCapacity(s, 'devs', v)}
                        />
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <CapacityInput
                          value={manual?.devDays ?? null}
                          disabled={loading}
                          onSave={(v) => saveCapacity(s, 'devDays', v)}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', color: '#6b7280' }}>{s.l3Delivered}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const capacityInputStyle: React.CSSProperties = {
  width: 56,
  fontSize: 13,
  padding: '4px 6px',
  borderRadius: 4,
  border: '1px solid #d1d5db',
  fontFamily: 'system-ui',
}

function CapacityInput({
  value,
  disabled,
  onSave,
}: {
  value: number | null
  disabled?: boolean
  onSave: (value: number | null) => Promise<void>
}) {
  const [local, setLocal] = useState(value === null ? '' : String(value))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocal(value === null ? '' : String(value))
  }, [value])

  async function commit() {
    const parsed = local.trim() === '' ? null : Number(local)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setLocal(value === null ? '' : String(value))
      return
    }
    if (parsed === value) return
    setSaving(true)
    try {
      await onSave(parsed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      type="number"
      min={0}
      step={1}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      disabled={disabled || saving}
      style={capacityInputStyle}
      aria-label="capacity"
    />
  )
}

function LoadingBlock({ text }: { text: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: '#888', fontFamily: 'system-ui' }}>
      {text}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        flex: '1 1 160px',
        minWidth: 140,
        border: `1px solid ${accent ? '#34a853' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '10px 14px',
        background: accent ? '#f0faf2' : '#fafafa',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? '#137333' : '#111' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
