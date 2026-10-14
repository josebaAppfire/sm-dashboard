import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nContext'

export interface DateRange {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const parseIso = (iso: string) => new Date(`${iso}T00:00:00`)

export default function DateRangePicker({ value, onChange }: Props) {
  const { t, locale, dateLocale } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [leftMonth, setLeftMonth] = useState(() => monthBefore(parseIso(value.to)))

  const today = toIsoDate(new Date())
  const currentMonth = startOfMonth(new Date())
  const weekStartsMonday = locale === 'es'

  const fmt = (iso: string) =>
    parseIso(iso).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openPicker() {
    setDraftStart(null)
    setHover(null)
    setLeftMonth(monthBefore(parseIso(value.to)))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setDraftStart(null)
    setHover(null)
  }

  function apply(range: DateRange) {
    close()
    if (range.from !== value.from || range.to !== value.to) onChange(range)
  }

  function pickDay(iso: string) {
    if (draftStart === null || iso < draftStart) {
      setDraftStart(iso)
      return
    }
    apply({ from: draftStart, to: iso })
  }

  function applyPreset(monthsBack: number | 'year' | 30) {
    const end = new Date()
    let start: Date
    if (monthsBack === 'year') start = new Date(end.getFullYear(), 0, 1)
    else if (monthsBack === 30) start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30)
    else start = new Date(end.getFullYear(), end.getMonth() - monthsBack, end.getDate())
    apply({ from: toIsoDate(start), to: toIsoDate(end) })
  }

  // While choosing, show the draft; otherwise the applied range.
  const shownStart = open && draftStart !== null ? draftStart : value.from
  const shownEnd = open && draftStart !== null ? null : value.to
  const previewEnd = draftStart !== null && hover !== null && hover >= draftStart ? hover : null

  const rangeStart = open ? (draftStart ?? value.from) : value.from
  const rangeEnd = open ? (draftStart !== null ? previewEnd : value.to) : value.to

  const rightMonth = addMonths(leftMonth, 1)
  const canGoNext = rightMonth < currentMonth

  return (
    <div ref={rootRef} style={{ position: 'relative', fontSize: 12, color: '#555' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{t('cycleTime.from')}</span>
        <button
          type="button"
          onClick={openPicker}
          style={fieldStyle(open && draftStart === null)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {fmt(shownStart)}
        </button>
        <span>{t('cycleTime.to')}</span>
        <button
          type="button"
          onClick={openPicker}
          style={fieldStyle(open && draftStart !== null)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {shownEnd ? fmt(shownEnd) : t('common.dash')}
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12,
            display: 'flex', gap: 16, fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid #f3f4f6', paddingRight: 12 }}>
            <PresetButton label={t('cycleTime.preset30d')} onClick={() => applyPreset(30)} />
            <PresetButton label={t('cycleTime.preset3m')} onClick={() => applyPreset(3)} />
            <PresetButton label={t('cycleTime.preset6m')} onClick={() => applyPreset(6)} />
            <PresetButton label={t('cycleTime.presetYear')} onClick={() => applyPreset('year')} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#1a73e8', fontWeight: 600, marginBottom: 8 }}>
              {draftStart === null ? t('cycleTime.pickStart') : t('cycleTime.pickEnd', { date: fmt(draftStart) })}
            </div>
            <div style={{ display: 'flex', gap: 16 }} onMouseLeave={() => setHover(null)}>
              {[leftMonth, rightMonth].map((month, idx) => (
                <MonthGrid
                  key={month.toISOString()}
                  month={month}
                  dateLocale={dateLocale}
                  weekStartsMonday={weekStartsMonday}
                  today={today}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  onPick={pickDay}
                  onHover={setHover}
                  onPrev={idx === 0 ? () => setLeftMonth(addMonths(leftMonth, -1)) : undefined}
                  onNext={idx === 1 && canGoNext ? () => setLeftMonth(addMonths(leftMonth, 1)) : undefined}
                  prevLabel={t('cycleTime.prevMonth')}
                  nextLabel={t('cycleTime.nextMonth')}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthGrid({
  month, dateLocale, weekStartsMonday, today, rangeStart, rangeEnd,
  onPick, onHover, onPrev, onNext, prevLabel, nextLabel,
}: {
  month: Date
  dateLocale: string
  weekStartsMonday: boolean
  today: string
  rangeStart: string | null
  rangeEnd: string | null
  onPick: (iso: string) => void
  onHover: (iso: string) => void
  onPrev?: () => void
  onNext?: () => void
  prevLabel: string
  nextLabel: string
}) {
  const year = month.getFullYear()
  const m = month.getMonth()
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const firstDow = new Date(year, m, 1).getDay()
  const offset = weekStartsMonday ? (firstDow + 6) % 7 : firstDow

  const weekdayNames = Array.from({ length: 7 }, (_, i) => {
    // 2024-01-01 was a Monday; 2023-12-31 a Sunday.
    const base = weekStartsMonday ? new Date(2024, 0, 1 + i) : new Date(2023, 11, 31 + i)
    return base.toLocaleDateString(dateLocale, { weekday: 'narrow' })
  })

  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, d) => toIsoDate(new Date(year, m, d + 1))),
  ]

  const title = month.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })

  return (
    <div style={{ width: 224 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <NavButton label={prevLabel} symbol="‹" onClick={onPrev} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#111', textTransform: 'capitalize' }}>
          {title}
        </div>
        <NavButton label={nextLabel} symbol="›" onClick={onNext} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', rowGap: 2 }}>
        {weekdayNames.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '2px 0' }}>{w}</div>
        ))}
        {cells.map((iso, i) => {
          if (iso === null) return <div key={`e${i}`} />
          const disabled = iso > today
          const isStart = iso === rangeStart
          const isEnd = iso === rangeEnd
          const inRange = rangeStart !== null && rangeEnd !== null && iso > rangeStart && iso < rangeEnd
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover(iso)}
              style={{
                width: 32, height: 30, border: 'none', fontSize: 12, padding: 0,
                cursor: disabled ? 'default' : 'pointer',
                borderRadius: isStart || isEnd ? 6 : 0,
                background: isStart || isEnd ? '#1a73e8' : inRange ? '#e8f0fe' : 'transparent',
                color: disabled ? '#d1d5db' : isStart || isEnd ? '#fff' : iso === today ? '#1a73e8' : '#111',
                fontWeight: isStart || isEnd || iso === today ? 600 : 400,
              }}
            >
              {Number(iso.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NavButton({ label, symbol, onClick }: { label: string; symbol: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
      style={{
        width: 24, height: 24, border: 'none', borderRadius: 6, fontSize: 16, lineHeight: 1,
        background: 'transparent', color: onClick ? '#374151' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {symbol}
    </button>
  )
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12, padding: '5px 10px', border: 'none', borderRadius: 6, textAlign: 'left',
        background: '#f9fafb', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function fieldStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 13, padding: '4px 8px', borderRadius: 6, minWidth: 110, textAlign: 'left',
    border: active ? '1px solid #1a73e8' : '1px solid #d1d5db',
    boxShadow: active ? '0 0 0 2px #e8f0fe' : 'none',
    background: '#fff', color: '#111', cursor: 'pointer',
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function monthBefore(d: Date): Date {
  return addMonths(startOfMonth(d), -1)
}
