import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import translationRu from "./locales/ru.json";
import translationKz from "./locales/kz.json";
import translationEn from "./locales/en.json";

const chatI18n = i18n.createInstance();
chatI18n.use(initReactI18next).init({
  resources: {
    рус: { translation: translationRu },
    қаз: { translation: translationKz },
    eng: { translation: translationEn },
  },
  lng: localStorage.getItem("locale") || "қаз",
  fallbackLng: localStorage.getItem("locale") || "қаз",
  interpolation: {
    escapeValue: false,
  },
});

export default chatI18n;
