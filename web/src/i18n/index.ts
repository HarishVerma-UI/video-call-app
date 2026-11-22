// Language + currency preferences. Both are per-device (localStorage) and apply
// instantly: i18next re-renders translated text, and the currency store notifies
// every component that formats money.
import i18n from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { hi } from './locales/hi';
import { nl } from './locales/nl';
import { ru } from './locales/ru';

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'hi', label: 'हिन्दी (Hindi)', locale: 'hi-IN' },
  { code: 'ru', label: 'Русский (Russian)', locale: 'ru-RU' },
  { code: 'nl', label: 'Nederlands (Dutch)', locale: 'nl-NL' },
  { code: 'de', label: 'Deutsch (German)', locale: 'de-DE' },
  { code: 'es', label: 'Español (Spanish)', locale: 'es-ES' },
  { code: 'fr', label: 'Français (French)', locale: 'fr-FR' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Approximate units per 1 USD. Display-only conversion — not for payments. */
export const CURRENCIES = {
  INR: { label: 'Indian Rupee (₹)', perUsd: 84 },
  USD: { label: 'US Dollar ($)', perUsd: 1 },
  EUR: { label: 'Euro (€)', perUsd: 0.92 },
  GBP: { label: 'British Pound (£)', perUsd: 0.79 },
  RUB: { label: 'Russian Ruble (₽)', perUsd: 92 },
  AED: { label: 'UAE Dirham (AED)', perUsd: 3.67 },
  JPY: { label: 'Japanese Yen (¥)', perUsd: 150 },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;

const LANG_KEY = 'huddle.language';
const CURRENCY_KEY = 'huddle.currency';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: keep in memory only */ }
}

const isLanguage = (v: string | null): v is LanguageCode => LANGUAGES.some((l) => l.code === v);
const isCurrency = (v: string | null): v is CurrencyCode => !!v && Object.hasOwn(CURRENCIES, v);

const initialLanguage: LanguageCode = isLanguage(read(LANG_KEY)) ? (read(LANG_KEY) as LanguageCode) : 'en';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    ru: { translation: ru },
    nl: { translation: nl },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});
document.documentElement.lang = initialLanguage;

export function setLanguage(code: LanguageCode) {
  write(LANG_KEY, code);
  document.documentElement.lang = code;
  void i18n.changeLanguage(code);
}

/** Intl locale for the active language (dates, numbers, money). */
export function activeLocale(lang = i18n.language): string {
  return LANGUAGES.find((l) => l.code === lang)?.locale ?? 'en-IN';
}

// --- currency store ---
let currency: CurrencyCode = isCurrency(read(CURRENCY_KEY)) ? (read(CURRENCY_KEY) as CurrencyCode) : 'INR';
const listeners = new Set<() => void>();

export function setCurrency(code: CurrencyCode) {
  currency = code;
  write(CURRENCY_KEY, code);
  listeners.forEach((fn) => fn());
}

export function useCurrency(): CurrencyCode {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => currency,
  );
}

/** Convert an amount between currencies. Unknown source currencies are returned unchanged. */
export function convert(amount: number, from: string, to: CurrencyCode): { value: number; currency: string } {
  const src = from?.toUpperCase();
  if (!isCurrency(src)) return { value: amount, currency: src || to };
  return { value: (amount / CURRENCIES[src].perUsd) * CURRENCIES[to].perUsd, currency: to };
}

export function formatMoney(amount: number, from: string, to: CurrencyCode, locale: string, compact = true): string {
  const { value, currency: cur } = convert(amount, from, to);
  // English defaults to Indian grouping (lakh/crore); use international grouping
  // for every other currency (e.g. "$21.4K", not lakh-style grouping).
  const loc = locale.startsWith('en') && cur !== 'INR' ? 'en-US' : locale;
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: cur,
      ...(compact ? { notation: 'compact', maximumSignificantDigits: 3 } : { maximumFractionDigits: 0 }),
    }).format(value);
  } catch {
    // Not an ISO currency code (free text from a job post): show it as typed.
    return `${cur} ${Math.round(value).toLocaleString(locale)}`;
  }
}

/** Money formatting bound to the user's language + currency; re-renders on change. */
export function useMoney() {
  const { i18n: inst } = useTranslation();
  const cur = useCurrency();
  const locale = activeLocale(inst.language);
  return {
    currency: cur,
    locale,
    money: (amount: number, from: string, compact = true) => formatMoney(amount, from, cur, locale, compact),
  };
}

export default i18n;
