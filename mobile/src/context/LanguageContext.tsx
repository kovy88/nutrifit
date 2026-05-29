// ── LANGUAGE CONTEXT
//
// Drží aktuální locale (cs | en), translator funkci `t`, a setter.
// Locale se při startu načte z AsyncStorage; pokud uživatel nikdy nevybral,
// detekuje se z device locale. Změna se persistuje.

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTranslator, detectDeviceLocale, type Locale, type Translate } from '../lib/i18n';

const STORAGE_KEY = 'nutrifit.locale.v1';

type LanguageContextValue = {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
  /** True until persisted locale has loaded (avoid flash of wrong language). */
  isReady: boolean;
};

const Context = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(detectDeviceLocale());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (!active) return;
      if (stored === 'cs' || stored === 'en') {
        setLocaleState(stored);
      }
      setIsReady(true);
    });
    return () => { active = false; };
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }

  const value = useMemo(() => ({ locale, t, setLocale, isReady }), [locale, t, isReady]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

/** Convenience: just the translator. */
export function useT(): Translate {
  return useLanguage().t;
}
