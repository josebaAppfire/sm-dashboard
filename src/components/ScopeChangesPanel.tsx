import { type ScopeChangesResponse, type ScopeChange, type L3SupportIssue } from '../lib/types'
import { jiraIssueUrl } from '../lib/teams'

interface Props {
  data: ScopeChangesResponse
  jiraBaseUrl: string
}

export default function ScopeChangesPanel({ data, jiraBaseUrl }: Props) {
  const hasDelta = data.scopeDelta !== 0
  const deltaColor = data.scopeDelta > 0 ? '#b91c1c' : data.scopeDelta < 0 ? '#137333' : '#374151'
  const deltaPrefix = data.scopeDelta > 0 ? '+' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '0 24px 24px', fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Scope del sprint ── */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'baseline',
        gap: 24,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
          Scope del sprint
        </span>
        <Stat label="Compromiso inicial" value={`${data.initialCommitment} SP`} />
        <Stat
          label="Scope añadido"
          value={hasDelta ? `${deltaPrefix}${data.scopeDelta} SP` : '—'}
          color={hasDelta ? deltaColor : '#9ca3af'}
        />
        <Stat label="Scope total actual" value={`${data.currentScope} SP`} bold />
      </div>

      {/* Changes table */}
      {data.changes.length === 0 ? (
        <div style={{ padding: '16px 20px', fontSize: 13, color: '#6b7280' }}>
          Sin cambios de scope desde el inicio del sprint.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
              <th style={th}>Issue</th>
              <th style={th}>Resumen</th>
              <th style={{ ...th, textAlign: 'center' }}>Tipo</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              <th style={{ ...th, textAlign: 'right' }}>SP inicial</th>
              <th style={{ ...th, textAlign: 'right' }}>SP actual</th>
              <th style={{ ...th, textAlign: 'right' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.changes.map((c) => (
              <ChangeRow key={c.key} change={c} jiraBaseUrl={jiraBaseUrl} />
            ))}
          </tbody>
        </table>
      )}

      </div>

      {/* ── L3 Support en el sprint ── */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          padding: '12px 20px',
          background: '#fafafa',
          borderBottom: data.l3AllIssues.length > 0 ? '1px solid #e2e8f0' : undefined,
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
            L3 Support en el sprint
          </span>
          <Stat label="Issues totales" value={`${data.l3AllIssues.length}`} />
          <Stat label="SP totales" value={data.l3TotalSp > 0 ? `${data.l3TotalSp} SP` : '—'} color="#92400e" bold />
          <Stat label="SP completados" value={data.l3DoneSp > 0 ? `${data.l3DoneSp} SP` : '—'} color="#166534" />
          <Stat
            label="SP pendientes"
            value={(data.l3TotalSp - data.l3DoneSp) > 0 ? `${data.l3TotalSp - data.l3DoneSp} SP` : '—'}
            color={(data.l3TotalSp - data.l3DoneSp) > 0 ? '#b91c1c' : '#9ca3af'}
          />
        </div>

        {data.l3AllIssues.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 13, color: '#6b7280' }}>
            Ninguna issue de L3 Support en este sprint.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
                <th style={th}>Issue</th>
                <th style={th}>Resumen</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>SP</th>
              </tr>
            </thead>
            <tbody>
              {data.l3AllIssues.map((i) => (
                <L3Row key={i.key} issue={i} jiraBaseUrl={jiraBaseUrl} />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e2e8f0', background: '#fafafa' }}>
                <td colSpan={2} style={{ ...td, fontWeight: 600, color: '#6b7280' }}>
                  Total L3 Support
                </td>
                <td style={{ ...td, textAlign: 'center', fontSize: 11, color: '#6b7280' }}>
                  {data.l3DoneIssues.length}/{data.l3AllIssues.length} cerradas
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                  {data.l3TotalSp} SP
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

function ChangeRow({ change: c, jiraBaseUrl }: { change: ScopeChange; jiraBaseUrl: string }) {
  const deltaColor = c.delta > 0 ? '#b91c1c' : '#137333'
  const deltaPrefix = c.delta > 0 ? '+' : ''

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <a
          href={jiraIssueUrl(jiraBaseUrl, c.key)}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1a73e8', textDecoration: 'none' }}
        >
          {c.key}
        </a>
      </td>
      <td style={{ ...td, color: '#374151', maxWidth: 400 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.summary}
        </span>
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        <TypeBadge type={c.type} />
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        <StatusBadge status={c.status} />
      </td>
      <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
        {c.initialSp > 0 ? `${c.initialSp} SP` : '—'}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>{c.currentSp} SP</td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: deltaColor }}>
        {deltaPrefix}{c.delta} SP
      </td>
    </tr>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const isDone = s === 'done'
  const isWfr = s.includes('waiting')
  const isInProgress = s.includes('progress')
  const bg = isDone || isWfr ? '#dcfce7' : isInProgress ? '#dbeafe' : '#f3f4f6'
  const color = isDone || isWfr ? '#166534' : isInProgress ? '#1e40af' : '#374151'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: ScopeChange['type'] }) {
  const map: Record<ScopeChange['type'], { label: string; bg: string; color: string }> = {
    added:        { label: 'Añadida',     bg: '#fef3c7', color: '#92400e' },
    sp_increased: { label: 'Actualizada', bg: '#e0e7ff', color: '#3730a3' },
    sp_decreased: { label: 'Actualizada', bg: '#e0e7ff', color: '#3730a3' },
  }
  const s = map[type]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

function Stat({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 11, color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: bold ? 700 : 600, color: color ?? '#111' }}>{value}</span>
    </div>
  )
}

function L3Row({ issue: i, jiraBaseUrl }: { issue: L3SupportIssue; jiraBaseUrl: string }) {
  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <a
          href={jiraIssueUrl(jiraBaseUrl, i.key)}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1a73e8', textDecoration: 'none' }}
        >
          {i.key}
        </a>
      </td>
      <td style={{ ...td, color: '#374151', maxWidth: 400 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {i.summary}
        </span>
      </td>
      <td style={{ ...td, textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 10,
          fontSize: 11, fontWeight: 600,
          background: i.status === 'Done' ? '#dcfce7' : '#fef3c7',
          color: i.status === 'Done' ? '#166534' : '#92400e',
          whiteSpace: 'nowrap',
        }}>
          {i.status}
        </span>
      </td>
      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
        {i.sp > 0 ? `${i.sp} SP` : '—'}
      </td>
    </tr>
  )
}

const th: React.CSSProperties = {
  padding: '8px 16px',
  textAlign: 'left',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 12,
}

const td: React.CSSProperties = {
  padding: '8px 16px',
  color: '#111',
}
