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
  const { currentChatId, sendFeedback } = useContext(ChatContext);
  const { t } = useTranslation(undefined, { i18n: chatI18n });

  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);

  const [hideGoodTooltip, setHideGoodTooltip] = useState(true);
  const [hideBadTooltip, setHideBadTooltip] = useState(true);

  const [modalType, setModalType] = useState(null);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);

  const resolvedMessageId =
    messageId ||
    (currentChatId ? getMessageIdByIndex(currentChatId, messageIndex) : null);

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

  // UPDATED: полный исправленный handleGoodFeedback
  const handleGoodFeedback = async () => {
    if (isLiked) return;

    try {
      setIsLiked(true);
      saveFeedbackState(currentChatId, messageIndex, "good");
      setHideGoodTooltip(true);

      if (!resolvedMessageId) {
        console.warn("⚠️ No message_id for feedback:", {
          currentChatId,
          messageIndex,
        });
        return;
      }

      console.log("➡️ Sending good feedback:", {
        resolvedMessageId,
        currentChatId,
      });

      await sendFeedback(resolvedMessageId, "good", "");

      console.log("✅ Feedback successfully sent");
    } catch (error) {
      console.error("❌ feedback failed:", error);
      setIsLiked(false);
    }
  };

  // ===== Обработка дизлайка =====
  const handleFeedbackSubmit = useCallback(
    async (text) => {
      if (isDisliked) return;
      try {
        setIsDisliked(true);
        saveFeedbackState(currentChatId, messageIndex, "bad");
        setHideBadTooltip(true);
        closeModal();

        if (!resolvedMessageId) {
          console.warn("No message_id for feedback:", {
            currentChatId,
            messageIndex,
          });
          return;
        }
        await sendFeedback(resolvedMessageId, "bad", text);
      } catch (error) {
        console.error("Ошибка при отправке дизлайка:", error);
        setIsDisliked(false);
      }
    },
    [sendFeedback, currentChatId, messageIndex, resolvedMessageId, isDisliked],
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
