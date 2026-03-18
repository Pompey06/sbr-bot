// src/components/Message/Modal/FeedbackModal.jsx

import React, { useState } from "react";
import { BaseModal } from "./BaseModal";
import { useTranslation } from "react-i18next";
import "./Modal.css";
import chatI18n from "../../../i18n";

export default function FeedbackModal({
  isOpen,
  onClose,
  title,
  description,
  onSubmit,
  feedbackType, // "good" | "bad"
}) {
  const { t } = useTranslation(undefined, { i18n: chatI18n });

  const [feedback, setFeedback] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [isError, setIsError] = useState(false);
  const [isReasonError, setIsReasonError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dislikeReasonOptions = [
    { value: "wrong_list", label: t("feedback.reasons.wrong_list") },
    {
      value: "wrong_quantity",
      label: t("feedback.reasons.wrong_quantity"),
    },
    {
      value: "confidentiality_issue",
      label: t("feedback.reasons.confidentiality_issue"),
    },
    {
      value: "wrong_classifier",
      label: t("feedback.reasons.wrong_classifier"),
    },
    { value: "other", label: t("feedback.reasons.other") },
  ];

  const handleFeedbackChange = (event) => {
    setFeedback(event.target.value);
    if (event.target.value.trim() !== "") {
      setIsError(false);
    }
  };

  const handleReasonChange = (event) => {
    setSelectedReason(event.target.value);
    if (event.target.value.trim() !== "") {
      setIsReasonError(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (feedbackType === "bad") {
      const isReasonEmpty = selectedReason.trim() === "";
      const isFeedbackEmpty = feedback.trim() === "";

      setIsReasonError(isReasonEmpty);
      setIsError(isFeedbackEmpty);

      if (isReasonEmpty || isFeedbackEmpty) {
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (onSubmit) {
        if (feedbackType === "bad") {
          await onSubmit(feedback, selectedReason);
        } else {
          await onSubmit(feedback);
        }
      }

      setFeedback("");
      setSelectedReason("");
      onClose();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleClose = () => {
    setFeedback("");
    setSelectedReason("");
    setIsError(false);
    setIsReasonError(false);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={title}>
      <p className="font-light text-base/6 mb-3">{description}</p>

      {feedbackType === "bad" && (
        <div className="flex flex-col gap-4">
          <textarea
            className={`w-full h-[150px] p-4 rounded-[12px] border bg-white focus:outline-none focus:ring-2 ${
              isError
                ? "border-2 border-red-500"
                : "border-[#D9D9D9] focus:ring-blue-500"
            }`}
            placeholder={t("modal.placeholder")}
            value={feedback}
            onChange={handleFeedbackChange}
            onKeyDown={handleKeyDown}
          ></textarea>

          <select
            className={`w-full h-[48px] px-4 rounded-[12px] border bg-white text-[16px] focus:outline-none focus:ring-2 ${
              isReasonError
                ? "border-2 border-red-500"
                : "border-[#D9D9D9] focus:ring-blue-500"
            } ${selectedReason ? "text-black" : "text-[#9CA3AF]"}`}
            value={selectedReason}
            onChange={handleReasonChange}
          >
            <option value="" disabled>
              {t("feedback.selectReasonPlaceholder")}
            </option>
            {dislikeReasonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {(isError || isReasonError) && (
            <p className="text-sm text-red-500!">{t("feedback.fillFeedbackError")}</p>
          )}
        </div>
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
