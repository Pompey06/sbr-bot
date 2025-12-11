import React, { useContext } from "react";
import "./Header.css";
import newBurgerIcon from "../../assets/newBurgerIcon.svg";
import { ChatContext } from "../../context/ChatContext";
import { useTranslation } from "react-i18next";
import chatI18n from "../../i18n";

const Header = ({ isSidebarOpen, toggleSidebar }) => {
  const { i18n } = useTranslation(undefined, { i18n: chatI18n });
  const { updateLocale } = useContext(ChatContext);

  const currentLang = i18n.language;

  const handleLanguageChange = (lang) => {
    updateLocale(lang);
  };

  return (
    <div className="h-[50px] chat-header justify-end header border-b-1 border-solid flex items-center px-4">
      <img
        src={newBurgerIcon}
        alt="Menu"
        className={`header__burger-icon ${
          isSidebarOpen ? "hidden" : "block"
        } md:hidden`}
        onClick={toggleSidebar}
      />

      <div className="flex language">
        <button
          className={`language__button rounded ${
            currentLang === "қаз" ? "bg-blue text-white" : "bg-gray color-blue"
          }`}
          onClick={() => handleLanguageChange("қаз")}
        >
          қаз
        </button>
        <button
          className={`language__button rounded ${
            currentLang === "рус" ? "bg-blue text-white" : "bg-gray color-blue"
          }`}
          onClick={() => handleLanguageChange("рус")}
        >
          рус
        </button>
        <button
          className={`language__button rounded ${
            currentLang === "eng" ? "bg-blue text-white" : "bg-gray color-blue"
          }`}
          onClick={() => handleLanguageChange("eng")}
        >
          eng
        </button>
      </div>
    </div>
  );
};

export default Header;
