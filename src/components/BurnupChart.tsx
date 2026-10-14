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
import { useI18n } from '../i18n/I18nContext'
import { type BurnupPoint, type BurnupResponse } from '../lib/types'

interface Props {
  data: BurnupResponse
}

export default function BurnupChart({ data }: Props) {
  const { t, dateLocale } = useI18n()
  const { series, sprint, totals } = data

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' })

  const scopeKey = t('burnup.seriesScope')
  const completedKey = t('burnup.seriesCompleted')

  const chartData = series.map((p: BurnupPoint) => ({
    date: fmt(p.date),
    [scopeKey]: p.scope,
    [completedKey]: p.completed,
  }))

  const completionPct =
    totals.scope > 0
      ? Math.round((totals.completedIncludingWfR / totals.scope) * 100)
      : 0

  const completedPct = totals.scope > 0
    ? Math.round((totals.completed / totals.scope) * 100)
    : 0

  const warningText =
    data.warning ??
    (data.dataSource === 'rest' && series.length <= 2 ? t('burnup.restWarning') : undefined)

  const sourceLabel =
    data.dataSource === 'rest' ? t('burnup.sourceRest') : t('burnup.sourceGreenhopper')

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#111' }}>
          {t('burnup.chartTitle')}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#555' }}>
          {sprint.name} &nbsp;·&nbsp; Board {sprint.id ?? '—'}
          &nbsp;·&nbsp;
          {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
          &nbsp;·&nbsp;
          <span
            style={{
              fontSize: 12,
              padding: '1px 6px',
              borderRadius: 4,
              background: sprint.state === 'active' ? '#e6f4ea' : '#f1f3f4',
              color: sprint.state === 'active' ? '#137333' : '#555',
            }}
          >
            {sprint.state}
          </span>
        </p>
      </div>

      {warningText && (
        <div
          style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            color: '#664d03',
            marginBottom: 16,
          }}
        >
          ⚠ {warningText}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label={t('burnup.totalScope')} value={totals.scope} />
        <StatCard
          label={t('burnup.completedDone')}
          value={totals.completed}
          sub={t('burnup.pctOfScope', { pct: completedPct })}
        />
        <StatCard
          label={t('burnup.doneWfr')}
          value={totals.completedIncludingWfR}
          sub={t('burnup.pctOfScope', { pct: completionPct })}
          accent
        />
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            label={{ value: t('burnup.date'), position: 'insideBottomRight', offset: -8, fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: 'Story Points', angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
          />
          <Tooltip
            formatter={(val: number, name: string) => [`${val} SP`, name]}
            labelFormatter={(l) => t('burnup.dateTooltip', { date: l })}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          <ReferenceLine
            y={totals.scope}
            stroke="#aaa"
            strokeDasharray="4 4"
            label={{ value: t('burnup.goal'), position: 'right', fontSize: 11, fill: '#888' }}
          />
          <Line
            type="monotone"
            dataKey={scopeKey}
            stroke="#1a73e8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey={completedKey}
            stroke="#34a853"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        {t('burnup.caption', { name: sprint.name, source: sourceLabel })}
      </p>
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
  value: number
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
        padding: '12px 16px',
        background: accent ? '#f0faf2' : '#fafafa',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? '#137333' : '#111', lineHeight: 1.1 }}>
        {value}
        <span style={{ fontSize: 14, fontWeight: 400, color: '#666', marginLeft: 4 }}>SP</span>
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
