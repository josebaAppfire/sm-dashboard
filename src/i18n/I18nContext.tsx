import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import en from './locales/en'
import es from './locales/es'

export type Locale = 'en' | 'es'

const STORAGE_KEY = 'sm-dashboard-locale'

const dictionaries: Record<Locale, Record<string, unknown>> = { en, es }

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'es') return stored
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

function getByPath(obj: unknown, path: string): string | undefined {
  const val = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
  return typeof val === 'string' ? val : undefined
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{{${key}}}`
  )
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TFunction
  dateLocale: string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback<TFunction>(
    (key, params) => {
      const raw = getByPath(dictionaries[locale], key) ?? getByPath(dictionaries.en, key) ?? key
      return interpolate(raw, params)
    },
    [locale]
  )

  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US'

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(
    () => ({ locale, setLocale, t, dateLocale }),
    [locale, setLocale, t, dateLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

/** Epic sentinel from the API — display name is translated in the UI. */
export const NO_PARENT_EPIC_KEY = '__NO_PARENT__'

export function epicDisplayName(
  epic: { key: string; name: string },
  t: TFunction
): string {
  return epic.key === NO_PARENT_EPIC_KEY ? t('epics.noEpic') : epic.name
}
