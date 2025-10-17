import React, { useContext, useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import { ChatContext } from "../../../context/ChatContext";
import { useTranslation } from "react-i18next";
import chatI18n from "../../../i18n";
import faqsData from "../../../assets/faqs.json";

export default function FaqModal({ isOpen, onClose }) {
  const { t, i18n } = useTranslation(undefined, { i18n: chatI18n });
  const { setInputPrefill } = useContext(ChatContext);
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    // UPDATED: соответствие между i18n языками и JSON
    const mapLang = {
      қаз: "kk",
      рус: "ru",
      eng: "en",
    };
    const currentLang = mapLang[i18n.language] || "ru";

    if (faqsData?.faqs?.length) {
      setFaqs(
        faqsData.faqs.map((f) => ({
          id: f.faq_id,
          question: f.questions[currentLang] || f.questions.ru,
        })),
      );
    }
  }, [i18n.language]);

  const handleSelect = (faqText) => {
    setInputPrefill(faqText);
    onClose();
  };

  // Определяем язык заголовка
  const mapLang = {
    қаз: "kk",
    рус: "ru",
    eng: "en",
  };
  const currentLang = mapLang[i18n.language] || "ru";

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={faqsData?.name?.[currentLang] || t("faq.title")}
      modalClassName="faq-modal"
    >
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
        {faqs.map((faq) => (
          <button
            key={faq.id}
            onClick={() => handleSelect(faq.question)}
            className="text-left px-4 py-2 border border-gray-200 rounded-md hover:bg-gray-100 transition"
          >
            {faq.question}
          </button>
        ))}
      </div>
    </BaseModal>
  );
}
