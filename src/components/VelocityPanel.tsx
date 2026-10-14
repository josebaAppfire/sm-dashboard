import { useState } from 'react'
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
import { type SprintRecord } from '../lib/types'
import { patchSprint, saveSprint, exportToMd } from '../lib/api'
import { useI18n } from '../i18n/I18nContext'
import SprintFormModal from './SprintFormModal'

interface Props {
  sprints: SprintRecord[]
  onRefresh: () => void
}

function rollingAvg(sprints: SprintRecord[], idx: number, window = 3): number | null {
  const comparable = sprints
    .slice(0, idx + 1)
    .filter((s) => s.delivered != null)
  if (comparable.length < window) return null
  const last = comparable.slice(-window)
  return Math.round(last.reduce((s, x) => s + (x.delivered ?? 0), 0) / window)
}

export default function VelocityPanel({ sprints, onRefresh }: Props) {
  const { t } = useI18n()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<SprintRecord | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const committedKey = t('velocity.chartCommitted')
  const deliveredKey = t('velocity.chartDelivered')
  const rollingKey = t('velocity.chartRolling')

  const chartData = sprints.map((s, i) => ({
    id: s.id,
    [committedKey]: s.committed,
    [deliveredKey]: s.delivered,
    [rollingKey]: rollingAvg(sprints, i),
  }))

  const withDelivered = sprints.filter((s) => s.delivered != null)
  const lastRef = withDelivered[withDelivered.length - 1]
  const velocidadRef = lastRef?.delivered ?? 0

  const tableHeaders = [
    t('velocity.colSprint'),
    t('velocity.colCommitted'),
    t('velocity.colDelivered'),
    t('velocity.colScope'),
    t('velocity.colDevs'),
    t('velocity.colDevDays'),
    t('velocity.colContext'),
    '',
  ]

  async function handleSave(sprint: SprintRecord) {
    if (editTarget) {
      await patchSprint(sprint.id, sprint)
    } else {
      await saveSprint(sprint)
    }
    setShowForm(false)
    setEditTarget(null)
    onRefresh()
  }

  async function handleExport() {
    setExporting(true)
    setExportMsg(null)
    try {
      await exportToMd()
      setExportMsg(t('velocity.exportOk'))
    } catch {
      setExportMsg(t('velocity.exportFail'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 960, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{t('velocity.title')}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
            {t('velocity.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={btnStyle('secondary')}
          >
            {exporting ? t('velocity.exporting') : t('velocity.exportMd')}
          </button>
          <button onClick={() => { setEditTarget(null); setShowForm(true) }} style={btnStyle('primary')}>
            {t('velocity.registerSprint')}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: 13, color: '#15803d' }}>
          {exportMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label={t('velocity.refCurrent')} value={`${velocidadRef} SP`} sub={lastRef?.id ?? t('common.dash')} accent />
        <StatCard label={t('velocity.totalSprints')} value={String(sprints.length)} />
        <StatCard
          label={t('velocity.rollingAvg')}
          value={
            withDelivered.length >= 3
              ? `${rollingAvg(sprints, sprints.length - 1) ?? t('common.dash')} SP`
              : t('common.dash')
          }
          sub={withDelivered.length < 3 ? t('velocity.needThreeSprints') : undefined}
        />
      </div>

      {sprints.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="id" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'Story Points', angle: -90, position: 'insideLeft', fontSize: 12 }} />
              <Tooltip formatter={(v: number, n: string) => [`${v} SP`, n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {velocidadRef > 0 && (
                <ReferenceLine y={velocidadRef} stroke="#aaa" strokeDasharray="4 4"
                  label={{ value: t('velocity.refLine'), position: 'right', fontSize: 11, fill: '#888' }} />
              )}
              <Line type="monotone" dataKey={committedKey} stroke="#1a73e8" strokeWidth={2} dot={{ r: 4 }} connectNulls />
              <Line type="monotone" dataKey={deliveredKey} stroke="#34a853" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              <Line type="monotone" dataKey={rollingKey} stroke="#ea4335" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            {t('velocity.footnote')}
          </p>
        </>
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14 }}>
          {t('velocity.empty')}
        </div>
      )}

      {sprints.length > 0 && (
        <div style={{ marginTop: 28, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                {tableHeaders.map((h) => (
                  <th key={h} style={{ padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sprints.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.id}</td>
                  <td style={{ padding: '6px 10px' }}>{s.committed ?? t('common.dash')}</td>
                  <td style={{ padding: '6px 10px', color: '#137333', fontWeight: 600 }}>{s.delivered ?? t('common.dash')}</td>
                  <td style={{ padding: '6px 10px', color: s.scope && s.committed && s.scope > s.committed ? '#d97706' : undefined }}>
                    {s.scope ?? t('common.dash')}
                  </td>
                  <td style={{ padding: '6px 10px' }}>{s.devs ?? t('common.dash')}</td>
                  <td style={{ padding: '6px 10px' }}>{s.devDays ?? t('common.dash')}</td>
                  <td style={{ padding: '6px 10px', color: '#555', maxWidth: 260 }}>{s.context}</td>
                  <td style={{ padding: '6px 10px' }}>
                    <button
                      onClick={() => { setEditTarget(s); setShowForm(true) }}
                      style={{ fontSize: 12, padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
                    >
                      {t('common.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <SprintFormModal
          initial={editTarget ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      flex: '1 1 160px', minWidth: 140, border: `1px solid ${accent ? '#34a853' : '#e5e7eb'}`,
      borderRadius: 8, padding: '10px 14px', background: accent ? '#f0faf2' : '#fafafa',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? '#137333' : '#111' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary') {
  return {
    fontSize: 13, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
    border: variant === 'primary' ? 'none' : '1px solid #d1d5db',
    background: variant === 'primary' ? '#1a73e8' : '#fff',
    color: variant === 'primary' ? '#fff' : '#374151',
  } as React.CSSProperties
}
