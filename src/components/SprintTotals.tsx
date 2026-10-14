import { useI18n } from '../i18n/I18nContext'
import { type BurnupResponse } from '../lib/types'

interface Props {
  totals: BurnupResponse['totals'] | null
}

export default function SprintTotals({ totals }: Props) {
  const { t } = useI18n()
  const pct = (sp: number) =>
    totals && totals.scope > 0 ? Math.round((sp / totals.scope) * 100) : 0

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, fontFamily: 'system-ui, sans-serif' }}>
      <StatCard label={t('sprintTotals.totalScope')} value={totals?.scope} />
      <StatCard
        label={t('sprintTotals.completedDone')}
        value={totals?.completed}
        sub={totals ? t('sprintTotals.pctOfScope', { pct: pct(totals.completed) }) : undefined}
      />
      <StatCard
        label={t('sprintTotals.doneWfr')}
        value={totals?.completedIncludingWfR}
        sub={totals ? t('sprintTotals.pctOfScope', { pct: pct(totals.completedIncludingWfR) }) : undefined}
        accent
      />
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
  value: number | undefined
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        border: `1px solid ${accent ? '#34a853' : '#e5e7eb'}`,
        borderRadius: 8,
        padding: '10px 14px',
        background: accent ? '#f0faf2' : '#fafafa',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? '#137333' : '#111', lineHeight: 1.1 }}>
        {value ?? '—'}
        {value != null && (
          <span style={{ fontSize: 13, fontWeight: 400, color: '#666', marginLeft: 4 }}>SP</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
