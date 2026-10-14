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
import { type BurnupPoint, type BurnupResponse } from '../lib/types'

interface Props {
  data: BurnupResponse
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

export default function BurnupChart({ data }: Props) {
  const { series, sprint, totals } = data

  const chartData = series.map((p: BurnupPoint) => ({
    date: fmt(p.date),
    Alcance: p.scope,
    Completado: p.completed,
  }))

  const completionPct =
    totals.scope > 0
      ? Math.round((totals.completedIncludingWfR / totals.scope) * 100)
      : 0

  const isSimplified = data.dataSource === 'rest-simplified'

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#111' }}>
          Sprint Burnup
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

      {/* Warning banner if using simplified fallback */}
      {isSimplified && (
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
          ⚠ {data.warning}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Alcance total (SP)" value={totals.scope} />
        <StatCard
          label="Completado (Done)"
          value={totals.completed}
          sub={`${Math.round(totals.scope > 0 ? (totals.completed / totals.scope) * 100 : 0)}% del alcance`}
        />
        <StatCard
          label="Done + Waiting for Release"
          value={totals.completedIncludingWfR}
          sub={`${completionPct}% del alcance`}
          accent
        />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            label={{ value: 'Fecha', position: 'insideBottomRight', offset: -8, fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: 'Story Points', angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
          />
          <Tooltip
            formatter={(val: number, name: string) => [`${val} SP`, name]}
            labelFormatter={(l) => `Fecha: ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          {/* Sprint end target line */}
          <ReferenceLine
            y={totals.scope}
            stroke="#aaa"
            strokeDasharray="4 4"
            label={{ value: 'Objetivo', position: 'right', fontSize: 11, fill: '#888' }}
          />
          <Line
            type="monotone"
            dataKey="Alcance"
            stroke="#1a73e8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="Completado"
            stroke="#34a853"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Caption */}
      <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        Fuente: Jira · Sprint {sprint.name} · Entregado = Done + Waiting for Release ·
        Datos vía {data.dataSource === 'greenhopper' ? 'GreenHopper API' : 'Jira REST API (simplificado)'}
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
