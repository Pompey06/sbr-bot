import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import translationRu from "./locales/ru.json";
import translationKz from "./locales/kz.json";
import translationEn from "./locales/en.json";

const RU_LANGUAGE = "\u0440\u0443\u0441";
const KZ_LANGUAGE = "\u049b\u0430\u0437";
const EN_LANGUAGE = "eng";
const DEFAULT_LANGUAGE = KZ_LANGUAGE;

const normalizeLanguage = (language) => {
   const normalizedLanguage = String(language || "").trim().toLowerCase();

   if (normalizedLanguage === "ru" || normalizedLanguage === RU_LANGUAGE) {
      return RU_LANGUAGE;
   }

   if (
      normalizedLanguage === "kz" ||
      normalizedLanguage === "kk" ||
      normalizedLanguage === KZ_LANGUAGE
   ) {
      return KZ_LANGUAGE;
   }

   if (normalizedLanguage === "en" || normalizedLanguage === EN_LANGUAGE) {
      return EN_LANGUAGE;
   }

   return null;
};

const getLanguageFromUrl = (url) => {
   try {
      const parsedUrl = new URL(url, window.location.origin);
      return normalizeLanguage(parsedUrl.searchParams.get("lang"));
   } catch {
      return null;
   }
};

const getLanguageFromPathname = (pathname) => {
   const pathLanguage = pathname.split("/").filter(Boolean)[0];
   return normalizeLanguage(pathLanguage);
};

const getPathLanguageFromUrl = (url) => {
   try {
      return getLanguageFromPathname(new URL(url, window.location.origin).pathname);
   } catch {
      return null;
   }
};

const getInitialLanguage = () => {
   const urls = [window.location.href];

   try {
      if (window.parent !== window) {
         urls.push(window.parent.location.href);
      }
   } catch {
      // The parent URL is inaccessible when the iframe has another origin.
   }

   if (document.referrer) {
      urls.push(document.referrer);
   }

   // An explicit URL parameter must win over saved/browser state and path.
   for (const url of urls) {
      const language = getLanguageFromUrl(url);
      if (language) return language;
   }

   for (const url of urls) {
      const language = getPathLanguageFromUrl(url);
      if (language) return language;
   }

   return normalizeLanguage(localStorage.getItem("locale")) || DEFAULT_LANGUAGE;
};

const initialLanguage = getInitialLanguage();
localStorage.setItem("locale", initialLanguage);

const chatI18n = i18n.createInstance();
chatI18n.use(initReactI18next).init({
   resources: {
      [RU_LANGUAGE]: { translation: translationRu },
      [KZ_LANGUAGE]: { translation: translationKz },
      [EN_LANGUAGE]: { translation: translationEn },
   },
   lng: initialLanguage,
   fallbackLng: initialLanguage,
   interpolation: {
      escapeValue: false,
   },
});

export default chatI18n;
