// src/components/Message/FeedbackMessage/FeedbackMessage.jsx

import React, { useState, useContext, useCallback, useEffect } from "react";
import { ChatContext } from "../../../context/ChatContext";
import FeedbackModal from "../Modal/FeedbackModal";
import "./Feedbackmessage.css";
import {
  getFeedbackType,
  saveFeedbackState,
  getMessageIdByIndex,
} from "../../../utils/feedbackStorage.jsx";

import badIcon from "../../../assets/bad.svg";
import goodIcon from "../../../assets/good.svg";
import goodIconFilled from "../../../assets/filled_like.svg";
import badIconFilled from "../../../assets/filled_dislike.svg";

import { useTranslation } from "react-i18next";
import chatI18n from "../../../i18n";

export default function FeedbackMessage({ messageIndex, messageId }) {
  const { currentChatId, sendFeedback, cacheMessageIdsFromHistory } =
    useContext(ChatContext);
  const { t } = useTranslation(undefined, { i18n: chatI18n });

  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);

  const [hideGoodTooltip, setHideGoodTooltip] = useState(true);
  const [hideBadTooltip, setHideBadTooltip] = useState(true);

  const [modalType, setModalType] = useState(null);
  const storageIndex =
    Number.isInteger(messageIndex) && messageIndex >= 0
      ? Math.floor(messageIndex / 2)
      : 0;
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);

  const resolvedMessageId =
    messageId ||
    (currentChatId ? getMessageIdByIndex(currentChatId, storageIndex) : null);

  useEffect(() => {
    const storedType =
      currentChatId !== null
        ? getFeedbackType(currentChatId, messageIndex)
        : null;

    if (storedType === "good") {
      setIsLiked(true);
      setIsDisliked(false);
    } else if (storedType === "bad") {
      setIsDisliked(true);
      setIsLiked(false);
    } else {
      setIsLiked(false);
      setIsDisliked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId, messageIndex]);

  const openModal = (type) => {
    setSelectedMessageIndex(messageIndex);
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedMessageIndex(null);
  };
  const handleGoodFeedback = async () => {
    if (isLiked) return;

    try {
      setIsLiked(true);
      // Для UI продолжаем хранить по messageIndex, чтобы не ломать историю
      saveFeedbackState(currentChatId, messageIndex, "good");
      setHideGoodTooltip(true);

      if (!resolvedMessageId) {
        console.warn("⚠️ No message_id for feedback:", {
          currentChatId,
          uiMessageIndex: messageIndex,
          storageIndex,
        });

        // Разово подтягиваем history и кешируем message_id
        if (currentChatId && cacheMessageIdsFromHistory) {
          await cacheMessageIdsFromHistory(currentChatId);
          const fallbackId = getMessageIdByIndex(currentChatId, storageIndex);

          if (!fallbackId) {
            console.warn("⚠️ Still no message_id after history fetch", {
              currentChatId,
              uiMessageIndex: messageIndex,
              storageIndex,
            });
            return;
          }

          console.log("➡️ Sending good feedback with fallbackId:", {
            fallbackId,
            currentChatId,
            storageIndex,
          });
          await sendFeedback(fallbackId, "good", "");
          console.log("✅ Feedback successfully sent (fallback)");
          return;
        }

        return;
      }

      console.log("➡️ Sending good feedback:", {
        resolvedMessageId,
        currentChatId,
        storageIndex,
      });

      await sendFeedback(resolvedMessageId, "good", "");

      console.log("✅ Feedback successfully sent");
    } catch (error) {
      console.error("❌ feedback failed:", error);
      setIsLiked(false);
    }
  };
  const handleFeedbackSubmit = useCallback(
    async (text) => {
      if (isDisliked) return;
      try {
        setIsDisliked(true);
        // Тут тоже оставляем UI-индекс для визуального состояния
        saveFeedbackState(currentChatId, messageIndex, "bad");
        setHideBadTooltip(true);
        closeModal();

        if (!resolvedMessageId) {
          console.warn("No message_id for feedback:", {
            currentChatId,
            uiMessageIndex: messageIndex,
            storageIndex,
          });

          if (currentChatId && cacheMessageIdsFromHistory) {
            await cacheMessageIdsFromHistory(currentChatId);
            const fallbackId = getMessageIdByIndex(currentChatId, storageIndex);

            if (!fallbackId) {
              console.warn(
                "Still no message_id after history fetch (bad feedback)",
                {
                  currentChatId,
                  uiMessageIndex: messageIndex,
                  storageIndex,
                },
              );
              return;
            }

            await sendFeedback(fallbackId, "bad", text);
            return;
          }

          return;
        }

        await sendFeedback(resolvedMessageId, "bad", text);
      } catch (error) {
        console.error("Ошибка при отправке дизлайка:", error);
        setIsDisliked(false);
      }
    },
    [
      sendFeedback,
      currentChatId,
      messageIndex,
      resolvedMessageId,
      isDisliked,
      cacheMessageIdsFromHistory,
      storageIndex,
    ],
  );
  return (
    <div className="feedback-message message mb-8 bg-white flex font-light flex-col items-start">
      <div className="flex gap-[4px] feedback-message__btns">
        {/* ======== Кнопка лайка ======== */}
        {!isDisliked && (
          <button
            type="button"
            className={`feedback-button items-center flex gap-[8px] bg-transparent text-black ${
              hideGoodTooltip ? "tooltip-hide" : ""
            } ${isLiked ? "feedback-button--disabled" : ""}`}
            style={{ touchAction: "manipulation", position: "relative" }}
            aria-label={t("feedback.goodAlt")}
            onMouseEnter={() => setHideGoodTooltip(false)}
            onMouseLeave={() => setHideGoodTooltip(true)}
            onClick={handleGoodFeedback}
          >
            {isLiked ? (
              <img src={goodIconFilled} alt={t("feedback.goodAlt")} />
            ) : (
              <img src={goodIcon} alt={t("feedback.goodAlt")} />
            )}
            <span className="tooltip">{t("feedback.goodAlt")}</span>
          </button>
        )}

        {/* ======== Кнопка дизлайка ======== */}
        {!isLiked && (
          <button
            type="button"
            className={`feedback-button items-center flex gap-[8px] bg-transparent text-black ${
              hideBadTooltip ? "tooltip-hide" : ""
            } ${isDisliked ? "feedback-button--disabled" : ""}`}
            style={{ touchAction: "manipulation", position: "relative" }}
            aria-label={t("feedback.badAlt")}
            onMouseEnter={() => setHideBadTooltip(false)}
            onMouseLeave={() => setHideBadTooltip(true)}
            onClick={() => {
              if (!isDisliked) openModal("bad");
            }}
          >
            {isDisliked ? (
              <img src={badIconFilled} alt={t("feedback.badAlt")} />
            ) : (
              <img src={badIcon} alt={t("feedback.badAlt")} />
            )}
            <span className="tooltip">{t("feedback.badAlt")}</span>
          </button>
        )}
      </div>

      {/* ======== Модалки ======== */}
      <FeedbackModal
        isOpen={modalType === "good"}
        onClose={closeModal}
        title={t("feedback.goodModalTitle")}
        description={t("feedback.goodModalDescription")}
        onSubmit={handleFeedbackSubmit}
        feedbackType="good"
        messageIndex={selectedMessageIndex}
        messageId={messageId}
        sessionId={currentChatId}
        userId={localStorage.getItem("sbr_user_id")}
      />

      <FeedbackModal
        isOpen={modalType === "bad"}
        onClose={closeModal}
        title={t("feedback.badModalTitle")}
        description={t("feedback.badModalDescription")}
        onSubmit={handleFeedbackSubmit}
        feedbackType="bad"
        messageIndex={selectedMessageIndex}
        messageId={messageId}
        sessionId={currentChatId}
        userId={localStorage.getItem("sbr_user_id")}
      />
    </div>
  );
}
