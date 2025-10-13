// UPDATED: FeedbackModal.jsx
import React, { useState } from "react";
import { BaseModal } from "./BaseModal";
import { useTranslation } from "react-i18next";
import "./Modal.css";
import chatI18n from "../../../i18n";
import axios from "axios";

export default function FeedbackModal({
  isOpen,
  onClose,
  title,
  description,
  onSubmit,
  feedbackType, // "good" | "bad"
  messageId,
  sessionId,
  userId,
}) {
  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiNew = axios.create({
    baseURL: import.meta.env.VITE_API_URL_NEW,
    withCredentials: false,
  });

  const handleFeedbackChange = (event) => {
    setFeedback(event.target.value);
    if (event.target.value.trim() !== "") setIsError(false);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (feedbackType === "bad" && feedback.trim() === "") {
      setIsError(true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (onSubmit) await onSubmit(feedback);
      setFeedback("");
      onClose();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // === Добавлено: отправка по Enter ===
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // чтобы не добавлялся перенос строки
      handleSubmit();
    }
  };

  const handleClose = () => {
    setFeedback("");
    setIsError(false);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={title}>
      <p className="font-light text-base/6 mb-3">{description}</p>

      {feedbackType === "bad" && (
        <textarea
          className={`w-full h-[150px] p-4 focus:outline-none focus:ring-2 ${
            isError ? "border-2 border-red-500" : "focus:ring-blue-500"
          }`}
          placeholder={t("modal.placeholder")}
          value={feedback}
          onChange={handleFeedbackChange}
          onKeyDown={handleKeyDown} // UPDATED
        ></textarea>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={isSubmitting}
          className={`feedback__button bg-blue text-xl text-white text-sm font-light shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isSubmitting ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={handleSubmit}
        >
          {isSubmitting ? t("modal.submitting") : t("modal.submit")}
        </button>
      </div>
    </BaseModal>
  );
}
