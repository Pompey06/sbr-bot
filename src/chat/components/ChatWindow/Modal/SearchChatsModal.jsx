import React, { useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import { useTranslation } from "react-i18next";
import chatI18n from "../../../i18n";

export default function SearchChatsModal({
  isOpen,
  onClose,
  onSelect,
  onSearch,
}) {
  const { t } = useTranslation(undefined, { i18n: chatI18n });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setIsLoading(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      const hits = await onSearch(trimmed);
      setResults(hits);
      setIsLoading(false);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [query, isOpen, onSearch]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("sidebar.searchTitle")}
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("sidebar.searchPlaceholder")}
          className="w-full h-[44px] px-4 rounded-[24px] border! border-[#ced2db]! focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {isLoading && (
          <p className="text-sm text-gray-500">{t("sidebar.searchLoading")}</p>
        )}

        {!isLoading && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-gray-500">
            {t("sidebar.searchNoResults")}
          </p>
        )}

        <div className="max-h-[360px] overflow-y-auto flex flex-col gap-2 pr-1">
          {results.map((hit) => (
            <button
              key={`${hit.session_id}-${hit.message_id}`}
              type="button"
              onClick={() => onSelect(hit)}
              className="text-left w-full p-3 rounded-xl border border-[#E5E7EB] hover:bg-[#F3F4F6] transition-colors"
            >
              <div className="text-xs text-gray-500 mb-1">
                {hit.session_name || t("sidebar.newChat")}
              </div>
              <div className="text-sm text-black overflow-hidden text-ellipsis">
                {hit.content_snippet || "..."}
              </div>
            </button>
          ))}
        </div>
      </div>
    </BaseModal>
  );
}
