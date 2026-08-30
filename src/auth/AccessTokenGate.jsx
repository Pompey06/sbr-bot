import { useEffect, useState } from "react";
import logo from "../chat/assets/logo.png";
import logoRu from "../chat/assets/logo_ru.png";
import "./AccessTokenGate.css";

const verificationRequests = new Map();

const getVerifyUrl = (token) => {
  const authApiUrl =
    import.meta.env.VITE_AUTH_API_URL ||
    (import.meta.env.DEV ? import.meta.env.VITE_API_URL_NEW : "");
  const baseUrl = authApiUrl || window.location.origin;
  const url = new URL("/api/verify", baseUrl);
  url.searchParams.set("token", token);
  return url;
};

const verifyAccessToken = (token) => {
  if (!verificationRequests.has(token)) {
    const request = fetch(getVerifyUrl(token), {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Access token verification failed: ${response.status}`);
      }
      return response;
    });

    // Keep successful requests cached so React StrictMode does not verify a
    // short-lived token twice during development.
    verificationRequests.set(token, request);
    request.catch(() => verificationRequests.delete(token));
  }

  return verificationRequests.get(token);
};

const getTokenFromUrl = () =>
  new URLSearchParams(window.location.search).get("token");

const getLanguage = () => {
  const language = new URLSearchParams(window.location.search).get("lang");
  return ["ru", "kz", "en"].includes(language) ? language : "kz";
};

const copy = {
  ru: {
    product: "AI-помощник статистики",
    checking: "Проверяем ссылку доступа",
    checkingHint: "Это займёт всего несколько секунд",
    deniedTitle: "Доступ ограничен",
    deniedWithToken:
      "Ссылка недействительна или срок её действия истёк. Запросите новую ссылку доступа.",
    deniedWithoutToken:
      "Откройте AI-помощника по персональной ссылке доступа.",
    retry: "Попробовать снова",
  },
  kz: {
    product: "Статистика бойынша AI-көмекші",
    checking: "Қолжетімділік сілтемесін тексеру",
    checkingHint: "Бұл бірнеше секундты алады",
    deniedTitle: "Қолжетімділік шектелген",
    deniedWithToken:
      "Сілтеме жарамсыз немесе оның қолданылу мерзімі аяқталған. Жаңа сілтеме сұраңыз.",
    deniedWithoutToken:
      "AI-көмекшіге жеке қолжетімділік сілтемесі арқылы кіріңіз.",
    retry: "Қайта көру",
  },
  en: {
    product: "AI statistics assistant",
    checking: "Checking your access link",
    checkingHint: "This will only take a few seconds",
    deniedTitle: "Access restricted",
    deniedWithToken:
      "This link is invalid or has expired. Please request a new access link.",
    deniedWithoutToken: "Open the AI assistant using your personal access link.",
    retry: "Try again",
  },
};

export default function AccessTokenGate({ children }) {
  // Keep the original token for the lifetime of this mounted gate. The URL is
  // replaced after verification, including when React re-runs effects.
  const [token] = useState(getTokenFromUrl);
  const [status, setStatus] = useState(token ? "checking" : "denied");
  const text = copy[getLanguage()];

  useEffect(() => {
    if (!token) return undefined;

    let isMounted = true;

    verifyAccessToken(token)
      .then(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url);
        if (isMounted) setStatus("authenticated");
      })
      .catch(() => {
        if (isMounted) setStatus("denied");
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (status === "checking") {
    return (
      <AuthScreen>
        <div className="auth-status-icon auth-status-icon--loading">
          <span className="auth-spinner" />
        </div>
        <h1 className="auth-title">{text.checking}</h1>
        <p className="auth-description">{text.checkingHint}</p>
      </AuthScreen>
    );
  }

  if (status === "denied") {
    return (
      <AuthScreen>
        <div className="auth-status-icon auth-status-icon--denied">!</div>
        <h1 className="auth-title">{text.deniedTitle}</h1>
        <p className="auth-description">
          {token ? text.deniedWithToken : text.deniedWithoutToken}
        </p>
        {token && (
          <button
            className="auth-retry"
            type="button"
            onClick={() => window.location.reload()}
          >
            {text.retry}
          </button>
        )}
      </AuthScreen>
    );
  }

  return children;
}

function AuthScreen({ children }) {
  const text = copy[getLanguage()];

  return (
    <main className="auth-screen">
      <img className="auth-watermark" src={logoRu} alt="" aria-hidden="true" />
      <section className="auth-panel" aria-live="polite">
        <div className="auth-brand">
          <img src={logo} alt="Qazstat" className="auth-logo" />
          <span>{text.product}</span>
        </div>
        <div className="auth-content">{children}</div>
        <div className="auth-footer">QAZSTAT · SBR</div>
      </section>
    </main>
  );
}
