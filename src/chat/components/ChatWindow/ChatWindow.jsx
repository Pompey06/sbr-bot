import React, { useContext, useState, useEffect } from "react";
import MessageList from "./MessageList/MessageList";
import MessageInput from "./MessageInput/MessageInput";
import BinModal from "../ChatWindow/Modal/BinModal";
import { ChatContext } from "../../context/ChatContext";
import Header from "../Header/Header";
import "./ChatWindow.css";
import chatI18n from "../../i18n";
import { useTranslation } from "react-i18next";
import personImage from "../../assets/person.png";

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
  } = useContext(ChatContext);

  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const [isBinModalOpen, setBinModalOpen] = useState(false);
  const currentChat = chats.find((c) => c.id === currentChatId) || chats[0];
  const isEmptyChat = currentChat.isEmpty;
  const { createMessage } = useContext(ChatContext);
  const currentLang = i18n.language;
  const showSpecialButton = import.meta.env.VITE_SHOW_SPECIAL_BUTTON === "true";
  const showAvatar = import.meta.env.VITE_SHOW_AVATAR === "true";
  const useAltGreeting = import.meta.env.VITE_USE_ALT_GREETING === "true";

  const handleLanguageChange = (lang) => {
    updateLocale(lang);
  };

  // Хук для отслеживания ширины экрана ≤ 700px
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
            {/* <div className="flex language">
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
            </div> */}

            <div
              className={
                `person__wrapper` +
                (useAltGreeting ? ` person__wrapper--alt` : ``)
              }
            >
              {showAvatar && (
                <img src={personImage} alt="" className="person" />
              )}
              <div
                className={
                  `chat-window-start__content` +
                  (useAltGreeting ? ` chat-window-start__content--alt` : ``)
                }
              >
                {t(useAltGreeting ? "chat.greetingAlt" : "chat.greeting")}
              </div>
            </div>

            <MessageInput />

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
            </div>

            <div className="person__wrapper">
              {showAvatar && (
                <img src={personImage} alt="" className="person" />
              )}
              <div
                className={
                  `chat-window-start__content` +
                  (useAltGreeting ? ` chat-window-start__content--alt` : ``)
                }
              >
                {t(useAltGreeting ? "chat.greetingAlt" : "chat.greeting")}
              </div>
            </div>

            <MessageInput />

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
      <MessageInput />
    </div>
  );
}
