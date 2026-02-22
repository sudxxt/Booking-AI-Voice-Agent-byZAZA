import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './locales/en.json';
import translationRU from './locales/ru.json';

const resources = {
    en: {
        translation: translationEN
    },
    ru: {
        translation: translationRU
    }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false // React already escapes values
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
        }
    });

export default i18n;
