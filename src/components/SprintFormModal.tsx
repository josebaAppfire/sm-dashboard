import { useState } from 'react'
import { type SprintRecord, type SprintHealth, type HealthColor } from '../lib/types'
import { useI18n } from '../i18n/I18nContext'

interface Props {
  initial?: SprintRecord
  onSave: (sprint: SprintRecord) => Promise<void>
  onClose: () => void
}

const EMPTY: SprintRecord = {
  id: '',
  jiraSprintId: null,
  startDate: null,
  endDate: null,
  committed: null,
  delivered: null,
  scope: null,
  devs: null,
  devDays: null,
  bucketA: null,
  bucketB: null,
  context: '',
  health: {},
}

const HEALTH_KEYS: (keyof SprintHealth)[] = [
  'procesoScrum',
  'claridadObjetivos',
  'colaboracion',
  'calidadTecnica',
  'velocidadFoco',
  'aprendizaje',
  'comunicacion',
  'diversionEnergia',
]

export default function SprintFormModal({ initial, onSave, onClose }: Props) {
  const { t } = useI18n()
  const [form, setForm] = useState<SprintRecord>(initial ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField<K extends keyof SprintRecord>(key: K, value: SprintRecord[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setHealth(dim: keyof SprintHealth, color: HealthColor) {
    setForm((prev) => ({ ...prev, health: { ...prev.health, [dim]: color } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.id.trim()) {
      setError(t('sprintForm.idRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  function numOrNull(v: string): number | null {
    const n = Number(v)
    return v === '' || isNaN(n) ? null : n
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: 28, width: 560,
        maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600 }}>
          {initial ? t('sprintForm.editTitle', { id: initial.id }) : t('sprintForm.registerTitle')}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Row>
            <Field label={t('sprintForm.idLabel')} hint={t('sprintForm.idHint')}>
              <input value={form.id} onChange={(e) => setField('id', e.target.value)}
                disabled={!!initial} style={inputStyle} placeholder="Q3-4" />
            </Field>
            <Field label={t('sprintForm.jiraSprintId')}>
              <input type="number" value={form.jiraSprintId ?? ''} style={inputStyle}
                onChange={(e) => setField('jiraSprintId', numOrNull(e.target.value))} />
            </Field>
          </Row>

          <Row>
            <Field label={t('sprintForm.start')}>
              <input type="date" value={form.startDate ?? ''} style={inputStyle}
                onChange={(e) => setField('startDate', e.target.value || null)} />
            </Field>
            <Field label={t('sprintForm.end')}>
              <input type="date" value={form.endDate ?? ''} style={inputStyle}
                onChange={(e) => setField('endDate', e.target.value || null)} />
            </Field>
          </Row>

          <Row>
            <Field label={t('sprintForm.spCommitted')}>
              <input type="number" value={form.committed ?? ''} style={inputStyle}
                onChange={(e) => setField('committed', numOrNull(e.target.value))} />
            </Field>
            <Field label={t('sprintForm.spDelivered')}>
              <input type="number" value={form.delivered ?? ''} style={inputStyle}
                onChange={(e) => setField('delivered', numOrNull(e.target.value))} />
            </Field>
            <Field label={t('sprintForm.finalScope')}>
              <input type="number" value={form.scope ?? ''} style={inputStyle}
                onChange={(e) => setField('scope', numOrNull(e.target.value))} />
            </Field>
          </Row>

          <Row>
            <Field label={t('sprintForm.devsInSprint')}>
              <input type="number" value={form.devs ?? ''} style={inputStyle}
                onChange={(e) => setField('devs', numOrNull(e.target.value))} />
            </Field>
            <Field label={t('sprintForm.totalPersonDays')}>
              <input type="number" value={form.devDays ?? ''} style={inputStyle}
                onChange={(e) => setField('devDays', numOrNull(e.target.value))} />
            </Field>
          </Row>

          <Row>
            <Field label={t('sprintForm.bucketA')}>
              <input type="number" value={form.bucketA ?? ''} style={inputStyle}
                onChange={(e) => setField('bucketA', numOrNull(e.target.value))} />
            </Field>
            <Field label={t('sprintForm.bucketB')}>
              <input type="number" value={form.bucketB ?? ''} style={inputStyle}
                onChange={(e) => setField('bucketB', numOrNull(e.target.value))} />
            </Field>
          </Row>

          <Field label={t('sprintForm.context')}>
            <textarea value={form.context} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              onChange={(e) => setField('context', e.target.value)} />
          </Field>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {t('sprintForm.healthTitle')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {HEALTH_KEYS.map((key) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, flex: 1, color: '#444' }}>{t(`health.${key}` as 'health.procesoScrum')}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['green', 'yellow', 'red'] as HealthColor[]).map((c) => (
                      <button key={c!} type="button"
                        onClick={() => setHealth(key, form.health[key] === c ? null : c)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                          background: c === 'green' ? '#34a853' : c === 'yellow' ? '#f59e0b' : '#ef4444',
                          opacity: form.health[key] === c ? 1 : 0.25,
                          transition: 'opacity 0.15s',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: '#b91c1c', padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={btnStyle('secondary')}>{t('common.cancel')}</button>
            <button type="submit" disabled={saving} style={btnStyle('primary')}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
        {label}{hint && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px', fontSize: 13, border: '1px solid #d1d5db',
  borderRadius: 5, outline: 'none', width: '100%', boxSizing: 'border-box',
}

function btnStyle(variant: 'primary' | 'secondary'): React.CSSProperties {
  return {
    fontSize: 13, padding: '7px 16px', borderRadius: 6, cursor: 'pointer',
    border: variant === 'primary' ? 'none' : '1px solid #d1d5db',
    background: variant === 'primary' ? '#1a73e8' : '#fff',
    color: variant === 'primary' ? '#fff' : '#374151',
  }
}
