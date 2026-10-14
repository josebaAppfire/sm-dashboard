import { useState } from 'react'
import { type SprintRecord, type SprintHealth, type HealthColor } from '../lib/types'

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

const HEALTH_DIMS: { key: keyof SprintHealth; label: string }[] = [
  { key: 'procesoScrum', label: 'Proceso Scrum' },
  { key: 'claridadObjetivos', label: 'Claridad de objetivos' },
  { key: 'colaboracion', label: 'Colaboración' },
  { key: 'calidadTecnica', label: 'Calidad técnica' },
  { key: 'velocidadFoco', label: 'Velocidad y foco' },
  { key: 'aprendizaje', label: 'Aprendizaje' },
  { key: 'comunicacion', label: 'Comunicación' },
  { key: 'diversionEnergia', label: 'Diversión / energía' },
]

export default function SprintFormModal({ initial, onSave, onClose }: Props) {
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
    if (!form.id.trim()) { setError('El ID del sprint es obligatorio (ej. Q3-4)'); return }
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
          {initial ? `Editar ${initial.id}` : 'Registrar sprint'}
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Identification */}
          <Row>
            <Field label="ID sprint *" hint="ej. Q3-4">
              <input value={form.id} onChange={(e) => setField('id', e.target.value)}
                disabled={!!initial} style={inputStyle} placeholder="Q3-4" />
            </Field>
            <Field label="Jira Sprint ID">
              <input type="number" value={form.jiraSprintId ?? ''} style={inputStyle}
                onChange={(e) => setField('jiraSprintId', numOrNull(e.target.value))} />
            </Field>
          </Row>

          <Row>
            <Field label="Inicio">
              <input type="date" value={form.startDate ?? ''} style={inputStyle}
                onChange={(e) => setField('startDate', e.target.value || null)} />
            </Field>
            <Field label="Fin">
              <input type="date" value={form.endDate ?? ''} style={inputStyle}
                onChange={(e) => setField('endDate', e.target.value || null)} />
            </Field>
          </Row>

          {/* SP */}
          <Row>
            <Field label="SP comprometidos">
              <input type="number" value={form.committed ?? ''} style={inputStyle}
                onChange={(e) => setField('committed', numOrNull(e.target.value))} />
            </Field>
            <Field label="SP entregados (Done+WfR)">
              <input type="number" value={form.delivered ?? ''} style={inputStyle}
                onChange={(e) => setField('delivered', numOrNull(e.target.value))} />
            </Field>
            <Field label="Alcance final">
              <input type="number" value={form.scope ?? ''} style={inputStyle}
                onChange={(e) => setField('scope', numOrNull(e.target.value))} />
            </Field>
          </Row>

          {/* Capacity */}
          <Row>
            <Field label="Devs en sprint">
              <input type="number" value={form.devs ?? ''} style={inputStyle}
                onChange={(e) => setField('devs', numOrNull(e.target.value))} />
            </Field>
            <Field label="Días-persona total">
              <input type="number" value={form.devDays ?? ''} style={inputStyle}
                onChange={(e) => setField('devDays', numOrNull(e.target.value))} />
            </Field>
          </Row>

          {/* Buckets */}
          <Row>
            <Field label="Cubeta A (SP)">
              <input type="number" value={form.bucketA ?? ''} style={inputStyle}
                onChange={(e) => setField('bucketA', numOrNull(e.target.value))} />
            </Field>
            <Field label="Cubeta B — Fixes (SP)">
              <input type="number" value={form.bucketB ?? ''} style={inputStyle}
                onChange={(e) => setField('bucketB', numOrNull(e.target.value))} />
            </Field>
          </Row>

          {/* Context */}
          <Field label="Contexto / notas">
            <textarea value={form.context} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
              onChange={(e) => setField('context', e.target.value)} />
          </Field>

          {/* Squad Health */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Squad Health Check (opcional)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {HEALTH_DIMS.map(({ key, label }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, flex: 1, color: '#444' }}>{label}</span>
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
            <button type="button" onClick={onClose} style={btnStyle('secondary')}>Cancelar</button>
            <button type="submit" disabled={saving} style={btnStyle('primary')}>
              {saving ? 'Guardando…' : 'Guardar'}
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
