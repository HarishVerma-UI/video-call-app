// Typed translation keys: t('nav.hme') is a compile error.
import 'i18next';
import type { en } from './locales/en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
