import { type InitialIssue } from '../lib/types'
import { jiraIssueUrl } from '../lib/teams'
import { useI18n } from '../i18n/I18nContext'

const DONE_SET = new Set(['done', 'waiting for release'])

function statusStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase()
  const isDone = DONE_SET.has(s)
  const isProgress = s.includes('progress')
  return {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: isDone ? '#dcfce7' : isProgress ? '#dbeafe' : '#f3f4f6',
    color: isDone ? '#166534' : isProgress ? '#1e40af' : '#374151',
  }
}

interface Props {
  issues: InitialIssue[]
  jiraBaseUrl: string
}

export default function InitialIssuesPanel({ issues, jiraBaseUrl }: Props) {
  const { t } = useI18n()
  const totalSp = issues.reduce((s, i) => s + i.sp, 0)
  const doneSp = issues.filter((i) => DONE_SET.has(i.status.toLowerCase())).reduce((s, i) => s + i.sp, 0)
  const pct = totalSp > 0 ? Math.round((doneSp / totalSp) * 100) : 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
      background: '#fff',
    }}>
      <div style={{
        padding: '12px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 8 }}>
          {t('initialIssues.title')}
          <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 12 }}>
            {t('initialIssues.issueCount', { count: issues.length, sp: totalSp })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: pct === 100 ? '#34a853' : '#1a73e8',
              borderRadius: 3, transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
            {doneSp}/{totalSp} SP ({pct}%)
          </span>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {issues.length === 0 ? (
          <div style={{ padding: '16px', fontSize: 13, color: '#9ca3af' }}>
            {t('initialIssues.empty')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>{t('initialIssues.colIssue')}</th>
                <th style={th}>{t('initialIssues.colSummary')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('common.sp')}</th>
                <th style={{ ...th, textAlign: 'center' }}>{t('initialIssues.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>
                    <a
                      href={jiraIssueUrl(jiraBaseUrl, issue.key)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#1a73e8', textDecoration: 'none' }}
                    >
                      {issue.key}
                    </a>
                  </td>
                  <td style={{ ...td, color: '#374151', maxWidth: 240 }}>
                    <span style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {issue.summary}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                    {issue.sp > 0 ? `${issue.sp}` : t('common.dash')}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={statusStyle(issue.status)}>{issue.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '7px 12px',
  textAlign: 'left',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 11,
}

const td: React.CSSProperties = {
  padding: '7px 12px',
  color: '#111',
}
