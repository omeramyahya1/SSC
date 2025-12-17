import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    backend: {
      // In Tauri, these files must be in the 'public/locales' folder
      loadPath: '/locales/{{lng}}/translations.json',
    }
  });

// Type-safe event listener for language changes
i18n.on('languageChanged', (lng: string) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  
  // Update the HTML tag attributes safely
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
  
  // Optional: Set a class on body for CSS targeting
  document.body.className = `lang-${lng}`;
});

export default i18n;