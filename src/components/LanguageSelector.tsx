import { useI18n, type Locale } from '../i18n/I18nContext'

const selectStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  cursor: 'pointer',
}

export default function LanguageSelector() {
  const { locale, setLocale, t } = useI18n()

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      style={selectStyle}
      aria-label={t('language.label')}
    >
      <option value="en">{t('language.en')}</option>
      <option value="es">{t('language.es')}</option>
    </select>
  )
}
