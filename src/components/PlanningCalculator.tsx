import { useEffect, useMemo, useState } from 'react'
import { type AutoVelocitySprint, type SprintRecord } from '../lib/types'
import { sprintLabel } from '../lib/sprintLabel'
import { useI18n } from '../i18n/I18nContext'

interface Props {
  sprints: AutoVelocitySprint[]
  manualByJiraId: Map<number, SprintRecord>
  loading?: boolean
}

type ReferenceCandidate = {
  key: string
  id: string
  delivered: number
  devDays: number | null
}

type PlanningDerived = {
  referenceSprintId: string
  referenceDelivered: number
  originalReferenceDelivered: number
  referenceDevDays: number
  capacityPct: number
  ceiling: number
  conservative: number
}

function calcDevDays(absences: number[], sprintDays: number) {
  return absences.reduce((sum, a) => sum + sprintDays - a, 0)
}

const DEFAULT_CONSERVATIVE_BUFFER = 8
const MAX_CONSERVATIVE_BUFFER = 50

export default function PlanningCalculator({ sprints, manualByJiraId, loading }: Props) {
  const { t } = useI18n()
  const referenceCandidates: ReferenceCandidate[] = sprints
    .filter((s) => s.state === 'closed' && s.delivered != null)
    .map((s) => ({
      key: String(s.jiraSprintId),
      id: sprintLabel(s),
      delivered: s.delivered ?? 0,
      devDays: manualByJiraId.get(s.jiraSprintId)?.devDays ?? null,
    }))
  const selectableCandidates = referenceCandidates.filter((s) => s.devDays != null && s.devDays > 0)

  const defaultRef = selectableCandidates[selectableCandidates.length - 1]?.key ?? ''

  const [sprintDays, setSprintDays] = useState(10)
  const [teamSize, setTeamSize] = useState(6)
  const [referenceId, setReferenceId] = useState(defaultRef)
  const [referencePicked, setReferencePicked] = useState(false)
  const [referenceSP, setReferenceSP] = useState<number | ''>('')
  const [conservativeBuffer, setConservativeBuffer] = useState<number | ''>(DEFAULT_CONSERVATIVE_BUFFER)
  const [devCount, setDevCount] = useState(6)
  const [absences, setAbsences] = useState<number[]>(() => Array(6).fill(0))
  const [goalPlanned, setGoalPlanned] = useState<number | ''>('')
  const [goalRelated, setGoalRelated] = useState<number | ''>('')

  const selectedRef = selectableCandidates.find((s) => s.key === referenceId) ?? null
  const originalDelivered = selectedRef?.delivered ?? null

  useEffect(() => {
    setAbsences((prev) => {
      if (devCount > prev.length) {
        return [...prev, ...Array(devCount - prev.length).fill(0)]
      }
      return prev.slice(0, devCount)
    })
  }, [devCount])

  const selectionValid = selectableCandidates.some((s) => s.key === referenceId)

  useEffect(() => {
    if (loading) return
    if (!referencePicked || !selectionValid) setReferenceId(defaultRef)
  }, [loading, defaultRef, referencePicked, selectionValid])

  useEffect(() => {
    if (selectedRef?.delivered != null) {
      setReferenceSP(selectedRef.delivered)
    } else {
      setReferenceSP('')
    }
  }, [referenceId, selectedRef?.delivered])

  const devDays = calcDevDays(absences, sprintDays)
  const theoreticalMax = teamSize * sprintDays
  const theoreticalPct = theoreticalMax > 0 ? devDays / theoreticalMax : 0

  const planning = useMemo((): PlanningDerived | null => {
    if (!selectedRef?.devDays || devDays <= 0) return null
    const sp = typeof referenceSP === 'number' ? referenceSP : 0
    const buffer = typeof conservativeBuffer === 'number' ? conservativeBuffer : 0
    const capacityPct = devDays / selectedRef.devDays
    const ceiling = Math.round(sp * capacityPct)
    const conservative = Math.round(ceiling * ((100 - buffer) / 100))
    return {
      referenceSprintId: selectedRef.id,
      referenceDelivered: sp,
      originalReferenceDelivered: selectedRef.delivered ?? sp,
      referenceDevDays: selectedRef.devDays,
      capacityPct,
      ceiling,
      conservative,
    }
  }, [selectedRef, devDays, referenceSP, conservativeBuffer])

  const goalPct =
    typeof goalPlanned === 'number' &&
    typeof goalRelated === 'number' &&
    goalPlanned > 0 &&
    goalRelated <= goalPlanned
      ? Math.round((goalRelated / goalPlanned) * 100)
      : null

  function updateAbsences(i: number, val: string) {
    const n = val === '' ? 0 : Math.max(0, Number(val))
    setAbsences((prev) => prev.map((a, idx) => idx === i ? n : a))
  }

  const referenceEdited =
    originalDelivered != null &&
    typeof referenceSP === 'number' &&
    referenceSP !== originalDelivered

  return (
    <div style={{ padding: '24px', maxWidth: 860, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 600 }}>{t('planning.title')}</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#666' }}>
        {t('planning.subtitle')}
      </p>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FormRow label={t('planning.referenceSprint')} hint={t('planning.referenceHint')}>
            <select
              value={referenceId}
              onChange={(e) => {
                setReferenceId(e.target.value)
                setReferencePicked(true)
              }}
              disabled={loading && referenceCandidates.length === 0}
              style={inputStyle}
            >
              <option value="">
                {loading && referenceCandidates.length === 0
                  ? t('common.loading')
                  : t('planning.selectPlaceholder')}
              </option>
              {referenceCandidates.map((s) => {
                const hasDevDays = s.devDays != null && s.devDays > 0
                return (
                  <option key={s.key} value={s.key} disabled={!hasDevDays}>
                    {hasDevDays
                      ? t('planning.referenceOption', {
                          id: s.id,
                          delivered: s.delivered,
                          devDays: s.devDays ?? 0,
                        })
                      : t('planning.referenceOptionNoDevDays', {
                          id: s.id,
                          delivered: s.delivered,
                        })}
                  </option>
                )
              })}
            </select>
            {!loading && selectableCandidates.length === 0 && (
              <span style={{ fontSize: 12, color: '#d97706' }}>
                {t('planning.noReference')}
              </span>
            )}
          </FormRow>

          <div style={{ display: 'flex', gap: 12 }}>
            <FormRow label={t('planning.sprintWorkdays')}>
              <input type="number" value={sprintDays} min={1} max={30} style={{ ...inputStyle, width: 80 }}
                onChange={(e) => setSprintDays(Number(e.target.value))} />
            </FormRow>
            <FormRow label={t('planning.teamSize')} hint={t('planning.teamSizeHint')}>
              <input type="number" value={teamSize} min={1} max={30} style={{ ...inputStyle, width: 80 }}
                onChange={(e) => setTeamSize(Math.max(1, Number(e.target.value)))} />
            </FormRow>
          </div>

          <FormRow label={t('planning.devsAvailable')}>
            <input type="number" value={devCount} min={1} max={20} style={{ ...inputStyle, width: 80 }}
              onChange={(e) => setDevCount(Math.max(1, Number(e.target.value)))} />
          </FormRow>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              {t('planning.availabilityTitle')}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              {t('planning.availabilityHint')}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>{t('planning.colDev')}</th>
                  <th style={thStyle}>{t('planning.colAbsences')}</th>
                  <th style={thStyle}>{t('planning.colNet')}</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((value, i) => {
                  const net = sprintDays - value
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '4px 8px', color: '#555' }}>{t('planning.colDev')} {i + 1}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" value={value || ''} min={0} style={{ ...inputStyle, width: 70 }}
                          onChange={(e) => updateAbsences(i, e.target.value)} placeholder="0" />
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
                  <td colSpan={2} style={{ padding: '6px 8px', fontWeight: 600, fontSize: 13 }}>
                    {t('planning.totalPersonDays')}
                  </td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, fontSize: 14 }}>{devDays}d</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ padding: '2px 8px', fontSize: 12, color: '#888' }}>
                    {t('planning.theoreticalMax', { devs: teamSize, days: sprintDays })}
                  </td>
                  <td style={{ padding: '2px 8px', fontSize: 12, color: '#888' }}>{theoreticalMax}d</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {planning && (
            <ResultPanel
              planning={planning}
              devDays={devDays}
              theoreticalMax={theoreticalMax}
              theoreticalPct={theoreticalPct}
              referenceSP={referenceSP}
              referenceEdited={referenceEdited}
              onReferenceSPChange={setReferenceSP}
              onReferenceSPReset={() => originalDelivered != null && setReferenceSP(originalDelivered)}
              conservativeBuffer={conservativeBuffer}
              onConservativeBufferChange={setConservativeBuffer}
            />
          )}

          <div style={{
            border: '1px solid #e2e8f0', borderRadius: 10,
            padding: 20, background: '#f8fafc',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {t('planning.goalTitle')}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              {t('planning.goalSubtitle')}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                  {t('planning.goalPlanned')}
                </label>
                <input
                  type="number"
                  value={goalPlanned}
                  min={1}
                  style={{ ...inputStyle, width: 100 }}
                  onChange={(e) => {
                    const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                    setGoalPlanned(v as number | '')
                    if (typeof goalRelated === 'number' && typeof v === 'number' && goalRelated > v) {
                      setGoalRelated(v)
                    }
                  }}
                  placeholder={t('planning.placeholderPlanned')}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                  {t('planning.goalRelated')}
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
                  placeholder={t('planning.placeholderRelated')}
                />
                {typeof goalRelated === 'number' &&
                  typeof goalPlanned === 'number' &&
                  goalRelated > goalPlanned && (
                  <span style={{ fontSize: 11, color: '#b91c1c' }}>
                    {t('planning.goalOverPlanned')}
                  </span>
                )}
              </div>

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
                    {t('planning.goalRelatedBadge')}
                  </span>
                </div>
              )}
            </div>

            {goalPct !== null && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
                {t('planning.goalFormula', {
                  related: goalRelated as number,
                  planned: goalPlanned as number,
                  pct: goalPct,
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultPanel({
  planning,
  devDays,
  theoreticalMax,
  theoreticalPct,
  referenceSP,
  referenceEdited,
  onReferenceSPChange,
  onReferenceSPReset,
  conservativeBuffer,
  onConservativeBufferChange,
}: {
  planning: PlanningDerived
  devDays: number
  theoreticalMax: number
  theoreticalPct: number
  referenceSP: number | ''
  referenceEdited: boolean
  onReferenceSPChange: (v: number | '') => void
  onReferenceSPReset: () => void
  conservativeBuffer: number | ''
  onConservativeBufferChange: (v: number | '') => void
}) {
  const { t } = useI18n()
  const refPct = Math.round(planning.capacityPct * 100)
  const theoPct = Math.round(theoreticalPct * 100)

  const referenceValue = (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      {referenceEdited && (
        <button
          type="button"
          onClick={onReferenceSPReset}
          title={t('planning.resetReference', { original: planning.originalReferenceDelivered })}
          aria-label={t('planning.resetReference', { original: planning.originalReferenceDelivered })}
          style={resetButtonStyle}
        >
          ↺
        </button>
      )}
      <input
        type="number"
        value={referenceSP}
        min={0}
        aria-label={t('planning.labelReference')}
        style={{
          ...inlineInputStyle,
          width: 56,
          fontSize: 15,
          fontWeight: 600,
          color: referenceEdited ? '#1a73e8' : '#111',
        }}
        onChange={(e) => {
          const v = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
          onReferenceSPChange(v)
        }}
      />
      SP
    </span>
  )

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
        {t('planning.resultTitle', { ref: planning.referenceSprintId })}
      </div>

      <FormulaLine
        label={t('planning.labelReference')}
        value={referenceValue}
        sub={t('planning.referenceSub', {
          id: planning.referenceSprintId,
          devDays: planning.referenceDevDays,
        })}
      />
      <FormulaLine
        label={t('planning.personDaysAvailable')}
        value={`${devDays} d`}
        sub={t('planning.personDaysSub', { max: theoreticalMax, available: devDays })}
      />

      <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0 8px' }} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <CapacityBadge
          label={t('planning.histCapacity')}
          sub={`vs. ${planning.referenceSprintId}`}
          pct={refPct}
          tip={t('planning.histCapacityTip', {
            available: devDays,
            refDevDays: planning.referenceDevDays,
          })}
        />
        <CapacityBadge
          label={t('planning.theoCapacity')}
          sub={t('planning.theoCapacitySub', { available: devDays, max: theoreticalMax })}
          pct={theoPct}
          tip={t('planning.theoCapacityTip')}
          dimColor
        />
      </div>

      <div style={{
        fontSize: 11, color: '#6b7280', padding: '6px 8px',
        background: '#f1f5f9', borderRadius: 5, marginBottom: 12,
      }}>
        {t('planning.capacityHelpHistorical')}<br />
        {t('planning.capacityHelpTheoretical')}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />
      <FormulaLine label={t('planning.ceiling')} value={`${planning.ceiling} SP`} big />
      <FormulaLine
        label={t('planning.conservative')}
        value={`${planning.conservative} SP`}
        sub={
          <>
            {t('planning.conservativeSub')} (−
            <input
              type="number"
              value={conservativeBuffer}
              min={0}
              max={MAX_CONSERVATIVE_BUFFER}
              aria-label={t('planning.conservativeBuffer')}
              style={{ ...inlineInputStyle, width: 34, fontSize: 11, color: '#6b7280' }}
              onChange={(e) => {
                const v = e.target.value === ''
                  ? ''
                  : Math.min(MAX_CONSERVATIVE_BUFFER, Math.max(0, Number(e.target.value)))
                onConservativeBufferChange(v)
              }}
            />
            %)
          </>
        }
      />
      <div style={{ marginTop: 12, padding: '8px 10px', background: '#fff', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, color: '#555' }}>
        {t('planning.ceilingFormula', {
          available: devDays,
          refDevDays: planning.referenceDevDays,
          ratio: planning.capacityPct.toFixed(2),
          refDelivered: planning.referenceDelivered,
          ceiling: planning.ceiling,
        })}
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
  label: string; value: React.ReactNode; sub?: React.ReactNode; big?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
      <div>
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: big ? 22 : 15, fontWeight: big ? 700 : 600, color: '#111', textAlign: 'right' }}>
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

const inlineInputStyle: React.CSSProperties = {
  padding: '0 2px', border: 'none', borderBottom: '1px dashed #9ca3af',
  background: 'transparent', outline: 'none', textAlign: 'right',
  fontFamily: 'inherit', MozAppearance: 'textfield',
}

const resetButtonStyle: React.CSSProperties = {
  fontSize: 13, color: '#1a73e8', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, lineHeight: 1,
}

const thStyle: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'left', color: '#6b7280', fontWeight: 500,
}