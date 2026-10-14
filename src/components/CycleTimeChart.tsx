import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useI18n } from '../i18n/I18nContext'
import { type CycleTimeIssue, type CycleTimeResponse } from '../lib/types'
import DateRangePicker, { type DateRange } from './DateRangePicker'

interface Props {
  data: CycleTimeResponse
  jiraBaseUrl: string
  range: DateRange
  onRangeChange: (range: DateRange) => void
}

interface Point extends CycleTimeIssue {
  completedMs: number
}

export default function CycleTimeChart({ data, jiraBaseUrl, range, onRangeChange }: Props) {
  const { t, dateLocale } = useI18n()
  const { stats, sprints, issues } = data

  const fmt = (ms: number | string) =>
    new Date(ms).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })
  const fmtFull = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00`).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })

  const points: Point[] = issues.map((i) => ({ ...i, completedMs: new Date(i.completedAt).getTime() }))
  const p85 = stats?.p85 ?? Infinity
  const withinP85 = points.filter((p) => p.cycleDays <= p85)
  const aboveP85 = points.filter((p) => p.cycleDays > p85)

  const sprintName = (id: number | null) => sprints.find((s) => s.id === id)?.name ?? t('common.dash')

  const openIssue = (p: Point) => {
    if (jiraBaseUrl) window.open(`${jiraBaseUrl}/browse/${p.key}`, '_blank', 'noopener')
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#111' }}>
            {t('cycleTime.chartTitle')}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#555' }}>
            {t('cycleTime.subtitle', { from: fmtFull(data.from), to: fmtFull(data.to) })}
          </p>
        </div>
        <DateRangePicker value={range} onChange={onRangeChange} />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label={t('cycleTime.median')} value={stats?.p50} unit={t('cycleTime.days')} sub={t('cycleTime.medianHint')} accent />
        <StatCard label={t('cycleTime.issuesDelivered')} value={stats?.count ?? 0} />
        <StatCard label={t('cycleTime.p85')} value={stats?.p85} unit={t('cycleTime.days')} sub={t('cycleTime.p85Hint')} />
        <StatCard label={t('cycleTime.avg')} value={stats?.avg} unit={t('cycleTime.days')} />
      </div>

      {points.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888', fontSize: 14 }}>
          {t('cycleTime.empty')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 8, right: 48, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              dataKey="completedMs"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmt}
              tick={{ fontSize: 12 }}
              name={t('cycleTime.completedAt')}
            />
            <YAxis
              type="number"
              dataKey="cycleDays"
              tick={{ fontSize: 12 }}
              label={{ value: t('cycleTime.yAxis'), angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as Point
                return (
                  <div style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
                    padding: '8px 10px', fontSize: 12, maxWidth: 280, boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  }}>
                    <div style={{ fontWeight: 600 }}>{p.key} · {p.issueType}</div>
                    <div style={{ color: '#555', margin: '2px 0 6px' }}>{p.summary}</div>
                    <div>{t('cycleTime.tooltipDays', { days: p.cycleDays })}</div>
                    <div style={{ color: '#666' }}>{fmt(p.startedAt)} → {fmt(p.completedAt)}</div>
                    <div style={{ color: '#666' }}>{sprintName(p.sprintId)}{p.sp != null ? ` · ${p.sp} SP` : ''}</div>
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
            {stats && (
              <ReferenceLine
                y={stats.p50}
                stroke="#1a73e8"
                strokeDasharray="4 4"
                label={{ value: `P50 · ${stats.p50}`, position: 'right', fontSize: 11, fill: '#1a73e8' }}
              />
            )}
            {stats && (
              <ReferenceLine
                y={stats.p85}
                stroke="#e37400"
                strokeDasharray="4 4"
                label={{ value: `P85 · ${stats.p85}`, position: 'right', fontSize: 11, fill: '#e37400' }}
              />
            )}
            <Scatter
              name={t('cycleTime.seriesWithin')}
              data={withinP85}
              fill="#34a853"
              cursor={jiraBaseUrl ? 'pointer' : undefined}
              onClick={(p: Point) => openIssue(p)}
            />
            <Scatter
              name={t('cycleTime.seriesAbove')}
              data={aboveP85}
              fill="#d93025"
              cursor={jiraBaseUrl ? 'pointer' : undefined}
              onClick={(p: Point) => openIssue(p)}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {sprints.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 16 }}>
          <thead>
            <tr style={{ color: '#6b7280', textAlign: 'left' }}>
              <th style={cellStyle}>{t('cycleTime.colSprint')}</th>
              <th style={cellStyle}>{t('cycleTime.colDates')}</th>
              <th style={cellStyle}>{t('cycleTime.colIssues')}</th>
              <th style={cellStyle}>{t('cycleTime.colMedian')}</th>
              <th style={cellStyle}>P85</th>
              <th style={cellStyle}>{t('cycleTime.colMax')}</th>
            </tr>
          </thead>
          <tbody>
            {sprints.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={cellStyle}>{s.name}</td>
                <td style={{ ...cellStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                  {s.startDate && s.endDate ? `${fmt(s.startDate)} → ${fmt(s.endDate)}` : t('common.dash')}
                </td>
                <td style={cellStyle}>{s.stats?.count ?? 0}</td>
                <td style={cellStyle}>{s.stats?.p50 ?? t('common.dash')}</td>
                <td style={cellStyle}>{s.stats?.p85 ?? t('common.dash')}</td>
                <td style={cellStyle}>{s.stats?.max ?? t('common.dash')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        {t('cycleTime.caption')}
        {data.skippedNoStart > 0 && ` ${t('cycleTime.skipped', { count: data.skippedNoStart })}`}
      </p>
    </div>
  )
}

const cellStyle: React.CSSProperties = { padding: '4px 8px' }
function StatCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string
  value: number | undefined
  unit?: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        minWidth: 120,
        border: `1px solid ${accent ? '#e37400' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '12px 16px',
        background: accent ? '#fef7e0' : '#fafafa',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? '#b06000' : '#111', lineHeight: 1.1 }}>
        {value ?? '—'}
        {unit && value != null && (
          <span style={{ fontSize: 14, fontWeight: 400, color: '#666', marginLeft: 4 }}>{unit}</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
