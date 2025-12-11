import React, { useContext, useState, useEffect } from "react";
import MessageList from "./MessageList/MessageList";
import MessageInput from "./MessageInput/MessageInput";
import BinModal from "../ChatWindow/Modal/BinModal";
import FaqModal from "../ChatWindow/Modal/FaqModal";
import faqs from "../../assets/faqs.json";
import { ChatContext } from "../../context/ChatContext";
import Header from "../Header/Header";
import "./ChatWindow.css";
import chatI18n from "../../i18n";
import { useTranslation } from "react-i18next";
import logoRu from "../../assets/logo_ru.png";
import logoKz from "../../assets/logo_kz.png";
import logoEn from "../../assets/logo_en.png";

export default function ChatWindow({ isSidebarOpen, toggleSidebar }) {
  const { i18n } = useTranslation(undefined, { i18n: chatI18n });
  const {
    chats,
    currentChatId,
    updateLocale,
    addBotMessage,
    setIsInBinFlow,
    fetchFormsByBin,
    setIsTyping,
    setChats,
    inputPrefill,
    setInputPrefill,
  } = useContext(ChatContext);

  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const [isBinModalOpen, setBinModalOpen] = useState(false);
  const [isFaqModalOpen, setFaqModalOpen] = useState(false);

  const currentChat = chats.find((c) => c.id === currentChatId) || chats[0];
  const isEmptyChat = currentChat.isEmpty;
  const { createMessage } = useContext(ChatContext);
  const currentLang = i18n.language;
  const showAvatar = import.meta.env.VITE_SHOW_AVATAR === "true";
  const useAltGreeting = import.meta.env.VITE_USE_ALT_GREETING === "true";

  const handleLanguageChange = (lang) => {
    updateLocale(lang);
  };

  const normalizeLang = (lang) => {
    if (lang === "рус") return "ru";
    if (lang === "қаз") return "kk";
    if (lang === "eng") return "en";
    return "ru";
  };

  const getLogoByLang = () => {
    if (currentLang === "қаз") return logoKz;
    if (currentLang === "рус") return logoRu;
    if (currentLang === "eng") return logoEn;
    return logoRu;
  };

  const [isSmall, setIsSmall] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const handler = (e) => setIsSmall(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleBinSubmit = async (bin, year) => {
    setBinModalOpen(false);
    setIsInBinFlow(true);

    setChats((prev) =>
      prev.map((chat) => {
        const isCurrent =
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && currentChatId === null);
        return isCurrent ? { ...chat, isBinChat: true } : chat;
      }),
    );

    setChats((prev) =>
      prev.map((chat) => {
        const isCurrent =
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && currentChatId === null);
        if (!isCurrent) return chat;
        return {
          ...chat,
          isEmpty: false,
          messages: chat.messages.filter((msg) => !msg.isButton),
        };
      }),
    );

    addBotMessage(t("binModal.foundForms", { bin }));
    setIsTyping(true);

    try {
      const forms = await fetchFormsByBin(bin, year);

      setChats((prev) =>
        prev.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;

          const msgs = [...chat.messages];
          const lastIdx = msgs.length - 1;
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            attachments: forms,
            runnerBin: bin,
          };
          return { ...chat, messages: msgs, isBinChat: true };
        }),
      );
    } catch (err) {
      console.error(err);
      addBotMessage("Ошибка при получении перечня форм. Попробуйте позже.");
    } finally {
      setIsTyping(false);
    }
  };

  if (isEmptyChat) {
    return (
      <div className="chat-window chat-window-start flex flex-col h-full items-center justify-center">
        <Header isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

        {isSmall ? (
          <div className="responsive-wrapper">
            <img src={getLogoByLang()} alt="logo" className="start-logo" />

            <div
              className={`person__wrapper${
                useAltGreeting ? " person__wrapper--alt" : ""
              }`}
            >
              {showAvatar && (
                <img src={personImage} alt="" className="person" />
              )}
              <div
                className={`chat-window-start__content${
                  useAltGreeting ? " chat-window-start__content--alt" : ""
                }`}
              >
                {t(useAltGreeting ? "chat.greetingAlt" : "chat.greeting")}
              </div>
              <p className="text-xs text-gray-500 mt-3 leading-snug annotation">
                {t("chat.annotation")}
              </p>
            </div>

            <MessageInput
              inputValue={inputPrefill}
              setInputValue={setInputPrefill}
            />

            <button
              type="button"
              className="faq__button border border-blue-500 text-blue-500 rounded-full px-4 py-2 hover:bg-blue-50 transition-colors mt-3"
              onClick={() => setFaqModalOpen(true)}
            >
              {t("faq.button")}
            </button>

            <div className="flex flex-wrap faq-buttons__wrapper justify-center gap-3  fade-in">
              {(faqs.faqs || []).slice(0, 6).map((faq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setInputPrefill(
                      faq.questions[normalizeLang(currentLang)] || "",
                    )
                  }
                  className="bg-blue-600 text-white px-5 py-2 rounded-full text-sm shadow-md start__button transition-all hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5"
                >
                  {faq.questions[normalizeLang(currentLang)]}
                </button>
              ))}
            </div>

            <MessageList
              isSidebarOpen={isSidebarOpen}
              toggleSidebar={toggleSidebar}
            />

            <BinModal
              isOpen={isBinModalOpen}
              onClose={() => setBinModalOpen(false)}
              onSubmitBin={handleBinSubmit}
              createMessage={createMessage}
            />

            <FaqModal
              isOpen={isFaqModalOpen}
              onClose={() => setFaqModalOpen(false)}
              onSelect={(faq) => setInputPrefill(faq)}
            />
          </div>
        ) : (
          <>
            <div className="flex language">
              <button
                className={`language__button rounded ${
                  currentLang === "қаз"
                    ? "bg-blue text-white"
                    : "bg-gray color-blue"
                }`}
                onClick={() => handleLanguageChange("қаз")}
              >
                қаз
              </button>
              <button
                className={`language__button rounded ${
                  currentLang === "рус"
                    ? "bg-blue text-white"
                    : "bg-gray color-blue"
                }`}
                onClick={() => handleLanguageChange("рус")}
              >
                рус
              </button>
              <button
                className={`language__button rounded ${
                  currentLang === "eng"
                    ? "bg-blue text-white"
                    : "bg-gray color-blue"
                }`}
                onClick={() => handleLanguageChange("eng")}
              >
                eng
              </button>
            </div>

            {isEmptyChat && (
              <img src={getLogoByLang()} alt="logo" className="start-logo" />
            )}

            <div className="person__wrapper">
              {showAvatar && (
                <img src={personImage} alt="" className="person" />
              )}
              <div
                className={`chat-window-start__content${
                  useAltGreeting ? " chat-window-start__content--alt" : ""
                }`}
              >
                {t(useAltGreeting ? "chat.greetingAlt" : "chat.greeting")}

                <p className="text-xs text-gray-500 mt-3 leading-snug annotation">
                  {t("chat.annotation")}
                </p>
              </div>
            </div>

            <MessageInput
              inputValue={inputPrefill}
              setInputValue={setInputPrefill}
            />

            <button
              type="button"
              className="btn special mt-4"
              onClick={() => setFaqModalOpen(true)}
            >
              {t("faq.button")}
            </button>

            <div className="flex flex-wrap faq-buttons__wrapper justify-center gap-3  fade-in">
              {(faqs.faqs || []).slice(0, 6).map((faq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setInputPrefill(
                      faq.questions[normalizeLang(currentLang)] || "",
                    )
                  }
                  className="bg-blue-600 text-white px-5 py-2 rounded-full text-sm shadow-md start__button transition-all hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5"
                >
                  {faq.questions[normalizeLang(currentLang)]}
                </button>
              ))}
            </div>

            <MessageList
              isSidebarOpen={isSidebarOpen}
              toggleSidebar={toggleSidebar}
            />

            <BinModal
              isOpen={isBinModalOpen}
              onClose={() => setBinModalOpen(false)}
              onSubmitBin={handleBinSubmit}
              createMessage={createMessage}
            />

            <FaqModal
              isOpen={isFaqModalOpen}
              onClose={() => setFaqModalOpen(false)}
              onSelect={(faq) => setInputPrefill(faq)}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="chat-window flex flex-col h-full">
      <MessageList
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
      />
      <MessageInput inputValue={inputPrefill} setInputValue={setInputPrefill} />
    </div>
  );
}
