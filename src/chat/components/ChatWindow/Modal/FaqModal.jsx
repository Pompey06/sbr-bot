import React, { useContext } from "react";
import { BaseModal } from "./BaseModal";
import { ChatContext } from "../../../context/ChatContext";
import { useTranslation } from "react-i18next";
import chatI18n from "../../../i18n";

export default function FaqModal({ isOpen, onClose }) {
  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const { setInputPrefill } = useContext(ChatContext);

  const handleSelect = (faq) => {
    setInputPrefill(faq);
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("faq.title")}
      modalClassName="faq-modal"
    >
      <div className="flex flex-col gap-3">
        <button
          onClick={() => handleSelect(t("faq.question1"))}
          className="text-left px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-100 transition"
        >
          {t("faq.question1")}
        </button>
        <button
          onClick={() => handleSelect(t("faq.question2"))}
          className="text-left px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-100 transition"
        >
          {t("faq.question2")}
        </button>
        <button
          onClick={() => handleSelect(t("faq.question3"))}
          className="text-left px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-100 transition"
        >
          {t("faq.question3")}
        </button>
      </div>
    </BaseModal>
  );
}
