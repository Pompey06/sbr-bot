import React, { useContext, useEffect, useRef, useState } from "react";
import Message from "../Message/Message";
import FeedbackMessage from "../FeeadbackMessage/FeedbackMessage";
import BadFeedbackRegistrationMessage from "../BadFeedbackRegistrationMessage/BadFeedbackRegistrationMessage";
import Header from "../../Header/Header";
import Sidebar from "../../Sidebar/Sidebar";
import { useTranslation } from "react-i18next";
import { ChatContext } from "../../../context/ChatContext";
import "./MessageList.css";
import TypingIndicator from "../TypingIndicator/TypingIndicator";
import chatI18n from "../../../i18n";

export default function MessageList({ isSidebarOpen, toggleSidebar }) {
  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const {
    chats,
    currentChatId,
    getBotMessageIndex,
    isTyping,
    handleButtonClick,
    showInitialButtons,
  } = useContext(ChatContext);

  // Определяем текущий чат
  const currentChat = chats.find(
    (c) => (currentChatId === null && c.id === null) || c.id === currentChatId,
  );
  // Извлекаем сообщения текущего чата
  const messages = currentChat?.messages || [];

  const scrollTargetRef = useRef(null);
  useEffect(() => {
    if (scrollTargetRef.current) {
      scrollTargetRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const useWindowWidth = () => {
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    useEffect(() => {
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, []);
    return windowWidth;
  };

  const windowWidth = useWindowWidth();

  // Вычисляем массив сообщений с вычислением индекса для фидбека
  let botCount = 0;
  const renderedMessages = messages.map((message, index) => {
    // Если сообщение является фидбеком – рендерим FeedbackMessage
    if (message.isGreeting && currentChat.isEmpty) {
      return null;
    }
    if (message.isFeedback) {
      const botMessageIndex = getBotMessageIndex(index);
      return (
        <FeedbackMessage
          key={index}
          text={message.text}
          messageIndex={botMessageIndex}
        />
      );
    }
    // Если сообщение предназначено для плохого фидбека – рендерим кастомное сообщение
    if (message.badFeedbackPrompt) {
      return (
        <BadFeedbackRegistrationMessage
          key={index}
          currentChatId={currentChatId}
        />
      );
    }
    // Для остальных сообщений – рендерим стандартное сообщение
    let feedbackIndex;
    if (!message.isUser && !message.isGreeting) {
      botCount++;
      feedbackIndex = botCount * 2 - 1;
    }
    console.log("🧩 message.chart:", message.chart);

    return (
      <Message
        key={index}
        text={message.text}
        isUser={message.isUser}
        isButton={message.isButton}
        onClick={
          message.isButton ? () => handleButtonClick(message) : undefined
        }
        filePath={message.filePath}
        filePaths={message.filePaths}
        isGreeting={message.isGreeting}
        botMessageIndex={feedbackIndex}
        isHtml={!message.isUser}
        isCustomMessage={message.isCustomMessage}
        isAssistantResponse={message.isAssistantResponse || false}
        streaming={message.streaming || false}
        attachments={message.attachments}
        runnerBin={message.runnerBin}
        chart={message.chart}
        excelFile={message.excelFile}
        hasExcel={message.hasExcel}
      >
        {/* Текст для начальных категорий */}
        {index === 0 && showInitialButtons && (
          <div className="suggestion-text mt-4">{t("chat.suggestionText")}</div>
        )}
        {index === 0 &&
          messages.some((msg) => msg.isButton && msg.isSubcategory) && (
            <div className="suggestion-text mt-4">
              {t("chat.interestingSuggestion")}
            </div>
          )}
        {index === 0 &&
          messages.some((msg) => msg.isButton && msg.isReport) && (
            <div className="suggestion-text mt-4">
              {t("chat.interestingSuggestion")}
            </div>
          )}
        {index === 0 && messages.some((msg) => msg.isButton && msg.isFaq) && (
          <div className="suggestion-text mt-4">
            {t("chat.interestingSuggestion")}
          </div>
        )}
      </Message>
    );
  });

  return (
    <div className="relative">
      <Header isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      {windowWidth < 700 && (
        <Sidebar isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      )}
      <div className="overflow-y-auto message-list-wrap">
        <div className="message-list justify-end flex flex-col">
          {renderedMessages}
          {isTyping && <TypingIndicator text={t("chatTyping.typingMessage")} />}
          <div ref={scrollTargetRef}></div>
        </div>
      </div>
    </div>
  );
}
