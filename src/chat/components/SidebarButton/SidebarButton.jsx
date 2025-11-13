import React from "react";
import "./SidebarButton.css";

function SidebarButton({ text, icon, onClick, className, title }) {
  return (
    <button
      onClick={onClick}
      title={title || text} // <-- ПОЛНОЕ название чата видно при наведении
      className={`flex text-xl/4 font-light sidebar__button items-center justify-between w-full hover:bg-gray-100 ${className}`}
    >
      <span className="chat__title">{text}</span>
      {icon && <span className="ml-2">{icon}</span>}
    </button>
  );
}

export default SidebarButton;
