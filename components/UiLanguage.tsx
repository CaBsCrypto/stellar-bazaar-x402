"use client";
import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {DEFAULT_UI_LANGUAGE, UI_LANGUAGE_STORAGE_KEY, savedUiLanguage, translateUi, serviceDisplayName, type UiLanguage} from '@/lib/ui-language';

type LanguageContext = {language: UiLanguage; t: (source: string, values?: readonly unknown[]) => string; selectLanguage: (language: UiLanguage) => void};
const LanguageContext = createContext<LanguageContext>({language: DEFAULT_UI_LANGUAGE, t: (source, values) => translateUi(DEFAULT_UI_LANGUAGE, source, values), selectLanguage: () => {}});
export function UiLanguageProvider({children}: {children: ReactNode}) {
  const [language, setLanguage] = useState<UiLanguage>(DEFAULT_UI_LANGUAGE);
  useEffect(() => {
    try { setLanguage(savedUiLanguage(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY))); } catch { /* The in-memory switch still works. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const selectLanguage = useCallback((next: UiLanguage) => {
    setLanguage(next);
    try { localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, next); } catch { /* Private browsing may deny storage. */ }
  }, []);
  const t = useCallback((source: string, values?: readonly unknown[]) => translateUi(language, source, values), [language]);
  return <LanguageContext.Provider value={{language, t, selectLanguage}}>{children}</LanguageContext.Provider>;
}
export function useUiLanguage() { return useContext(LanguageContext); }
export function UiText({text, values}: {text: string; values?: readonly unknown[]}) {
  const {t} = useUiLanguage();
  return <>{t(text, values)}</>;
}
export function UiOutputLabel({text}: {text: string}) {
  const {t} = useUiLanguage();
  // Resource-page output labels are presentation metadata, not delivered bytes.
  const contentType = /^Tipo de contenido: (.+)$/.exec(text);
  return <>{contentType ? t('Tipo de contenido: {0}', [t(contentType[1])]) : t(text)}</>;
}
export function UiServiceName({id, name}: {id: string; name: string}) {
  const {language} = useUiLanguage();
  return <>{serviceDisplayName(language, id, name)}</>;
}
export function UiServiceDescription({id, description}: {id: string; description: string}) {
  const {language, t} = useUiLanguage();
  // A presentation summary; canonical terms are displayed in the original card.
  return <>{id === 'guionista-bazaar-production-text-v1' && language === 'en'
    ? "Provider's script service. Review the original service card for its declared terms."
    : description}</>;
}
export function LanguageSwitch() {
  const {language, t, selectLanguage} = useUiLanguage();
  return <div className="ui-language-switch" role="group" aria-label={t('Idioma de la interfaz')}>
    <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => selectLanguage('en')}>EN</button>
    <button type="button" lang="es" aria-label="Español" aria-pressed={language === 'es'} onClick={() => selectLanguage('es')}>ES</button>
  </div>;
}
