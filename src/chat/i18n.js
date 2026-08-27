import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import translationRu from "./locales/ru.json";
import translationKz from "./locales/kz.json";
import translationEn from "./locales/en.json";

const getLanguageFromPathname = (pathname) => {
   const pathLanguage = pathname.split("/").filter(Boolean)[0];

   if (pathLanguage === "ru") return "рус";
   if (pathLanguage === "en") return "eng";
   if (pathLanguage === "kz" || pathLanguage === "kk") return "қаз";
   if (!pathLanguage) return "қаз";

   return null;
};

const getEmbeddedLanguage = () => {
   try {
      const parentLanguage = getLanguageFromPathname(window.parent.location.pathname);
      if (parentLanguage) return parentLanguage;
   } catch {
      // The parent URL is inaccessible when the iframe has another origin.
   }

   if (document.referrer) {
      try {
         return getLanguageFromPathname(new URL(document.referrer).pathname);
      } catch {
         return null;
      }
   }

   return null;
};

const storedLanguage = localStorage.getItem("locale");
const embeddedLanguage = getEmbeddedLanguage();
const initialLanguage = embeddedLanguage || storedLanguage || "қаз";

if (embeddedLanguage && storedLanguage !== embeddedLanguage) {
   localStorage.setItem("locale", embeddedLanguage);
}

const chatI18n = i18n.createInstance();
chatI18n.use(initReactI18next).init({
   resources: {
      рус: { translation: translationRu },
      қаз: { translation: translationKz },
      eng: { translation: translationEn },
   },
   lng: initialLanguage,
   fallbackLng: initialLanguage,
   interpolation: {
      escapeValue: false,
   },
});

export default chatI18n;
