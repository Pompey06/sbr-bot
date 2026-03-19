// src/components/Message/Message.jsx

import axios from "axios";
import copy from "copy-to-clipboard";
import React, { useContext, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import checkIcon from "../../../assets/checkmark.svg";
import copyIcon from "../../../assets/copy.svg";
import downloadIcon from "../../../assets/excel.svg";
import personImage from "../../../assets/person.png";
import { ChatContext } from "../../../context/ChatContext";
import chatI18n from "../../../i18n";
import FeedbackMessage from "../FeeadbackMessage/FeedbackMessage";
import "./Message.css";

export default function Message({
  text,
  isUser,
  isButton,
  onClick,
  filePath,
  filePaths,
  isGreeting,
  botMessageIndex,
  streaming,
  attachments,
  chart,
  excelFile,
  hasExcel,
  showTable,
  tableColumns,
  rawData,
  isCustomMessage = false,
  isAssistantResponse = false,
  messageId = null,
  isHighlighted = false,
}) {
  const { t, i18n } = useTranslation(undefined, { i18n: chatI18n });
  const [fileReadyMap, setFileReadyMap] = useState({});
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL_NEW || "http://172.16.17.4:8001",
    withCredentials: false,
  });
  const { downloadForm, chats, currentChatId } = useContext(ChatContext);
  const [fileBlobMap, setFileBlobMap] = useState({});
  const [downloadingId, setDownloadingId] = useState(null);
  const [forceRender, setForceRender] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [showFullChart, setShowFullChart] = useState(false);
  const chartRef = useRef(null);

  // 1) Добавили состояние для управления «скрытием» тултипа кнопки «Копировать»
  const [hideCopyTooltip, setHideCopyTooltip] = useState(true);

  const showAvatar = import.meta.env.VITE_SHOW_AVATAR === "true";

  useEffect(() => {
    if (chart?.success) console.log("📈 chart_html:", chart.chart_html);
  }, [chart]);

  useEffect(() => {
    if (!chart) return;

    const root = chartRef.current;
    if (!root) return;

    setChartReady(false);

    // очищаем только вложенный div, React-контейнер не трогаем
    let plotContainer = root.querySelector(".plot-root");
    if (!plotContainer) {
      plotContainer = document.createElement("div");
      plotContainer.className = "plot-root";
      root.appendChild(plotContainer);
    }
    plotContainer.replaceChildren(); // безопасное очищение

    const ensurePlotlyLoaded = () =>
      new Promise((resolve) => {
        if (window.Plotly) return resolve();
        const script = document.createElement("script");
        script.src = "https://cdn.plot.ly/plotly-3.1.0.min.js";
        script.async = false;
        script.onload = resolve;
        script.onerror = resolve;
        document.body.appendChild(script);
      });

    const renderFromRawData = async () => {
      if (!rawData?.length) return;
      await ensurePlotlyLoaded();
      const x = rawData.map((d) => d.year || d.x || "");
      const y = rawData.map((d) => d.total_ip || d.y || 0);
      const trace = {
        x,
        y,
        type: "scatter",
        mode: "lines+markers+text",
        text: y.map(String),
        textposition: "top center",
      };
      const layout = {
        margin: { t: 40, l: 40, r: 20, b: 40 },
        height: 400,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
      };
      try {
        window.Plotly.newPlot(plotContainer, [trace], layout, {
          displayModeBar: false,
        });
        setChartReady(true);
      } catch (e) {
        console.error("Ошибка при построении графика:", e);
      }
    };

    const renderFromHtml = async (html) => {
      if (!html) return;
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const chartDiv =
          doc.querySelector(".plotly-graph-div") ||
          doc.querySelector("div[id^='chart_']");
        if (!chartDiv) return;
        const chartClone = chartDiv.cloneNode(true);
        plotContainer.innerHTML = "";
        plotContainer.appendChild(chartClone);

        await ensurePlotlyLoaded();
        const scripts = Array.from(doc.querySelectorAll("script"));
        scripts.forEach((s) => {
          if (s.src?.includes("plotly")) return;
          if (s.textContent?.trim()) {
            const newScript = document.createElement("script");
            newScript.textContent = s.textContent;
            plotContainer.appendChild(newScript);
          }
        });
        setChartReady(true);
      } catch (e) {
        console.error("Ошибка отрисовки chart_html:", e);
      }
    };

    const loadAndRender = async () => {
      try {
        // UPDATED: если есть chart_id, рендерим так же, как при загрузке из history (через /api/charts),
        // а rawData используем только для "чистых" графиков без chart_id
        if (rawData?.length && !chart?.chart_id)
          return await renderFromRawData();
        if (chart.chart_html) return await renderFromHtml(chart.chart_html);
        if (chart.chart_id && !chart.success) {
          const response = await api.get(`/api/charts/${chart.chart_id}`);
          const html = response.data?.chart_html;
          if (response.data?.success && html) await renderFromHtml(html);
        }
      } catch (err) {
        console.error("Ошибка загрузки чарта:", err);
      }
    };

    loadAndRender();

    return () => {
      // UPDATED: безопасное очищение без прямого удаления элементов из DOM,
      // чтобы React не вызывал NotFoundError при повторном размонтировании
      if (plotContainer) {
        try {
          while (plotContainer.firstChild) {
            plotContainer.removeChild(plotContainer.firstChild);
          }
        } catch (e) {
          console.warn("Chart cleanup skipped:", e);
        }
      }
    };
  }, [chart, rawData]);

  const allFilePaths = React.useMemo(() => {
    if (filePaths && Array.isArray(filePaths)) {
      return filePaths.filter((path) => typeof path === "string");
    } else if (filePath) {
      return typeof filePath === "string"
        ? [filePath]
        : Array.isArray(filePath)
        ? filePath.filter((path) => typeof path === "string")
        : [];
    }
    return [];
  }, [filePath, filePaths]);

  const handleDownload = async (e, path) => {
    e.preventDefault();
    if (!path || typeof path !== "string") {
      console.error("Invalid file path:", path);
      return;
    }
    try {
      const response = await api.get(`/knowledge/get-file`, {
        params: { path },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const fileName = path.split("/").pop() || "file";
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Ошибка загрузки файла:", error);
    }
  };

  useEffect(() => {
    const att = attachments?.[0];
    if (!att?.order_id) return;

    (async () => {
      try {
        const lang = i18n.language === "қаз" ? "kk" : "ru";
        const response = await api.get("/begunok/report", {
          params: { order_id: att.order_id, lang },
          responseType: "blob",
        });

        if (
          response.status === 200 &&
          response.data.type === "application/pdf"
        ) {
          const blobUrl = URL.createObjectURL(response.data);
          setFileReadyMap((prev) => ({ ...prev, [att.formVersionId]: true }));
          setFileBlobMap((prev) => ({ ...prev, [att.formVersionId]: blobUrl }));
        }
      } catch (err) {
        console.error("Ошибка загрузки отчёта:", err);
      }
    })();
  }, [attachments]);

  const getFileName = (path) => {
    if (!path || typeof path !== "string") return "file";
    try {
      return path.split("/").pop() || "file";
    } catch (error) {
      console.error("Error getting file name:", error);
      return "file";
    }
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    // 2) Сразу «скрываем» тултип при клике
    setHideCopyTooltip(true);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {
          const ok = copy(text);
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } else {
            console.error("Не удалось скопировать текст");
          }
        });
    } else {
      const ok = copy(text);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } else {
        console.error("Не удалось скопировать текст");
      }
    }
  };

  // Находит в стейте чат и его attachments по formVersionId
  const getAttachment = (formVersionId) => {
    const currentChat = chats.find(
      (c) =>
        String(c.id) === String(currentChatId) ||
        (c.id === null && currentChatId === null),
    );
    if (!currentChat) return null;
    const msg = currentChat.messages.find((m) => m.attachments);
    return (
      msg?.attachments?.find((a) => a.formVersionId === formVersionId) || null
    );
  };

  const handleDownloadClick = (e, att) => {
    e.preventDefault();
    const blobUrl = fileBlobMap[att.formVersionId];
    if (!blobUrl) {
      console.error("Файл ещё не готов");
      return;
    }

    // Open in new tab - base target="_parent" will handle iframe behavior
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      console.error("Браузер заблокировал всплывающее окно");
    }
  };

  return (
    <div
      data-message-id={messageId || undefined}
      className={`message mb-6 flex font-light ${
        isUser
          ? "user text-right self-end text-white"
          : `self-start relative ${!isGreeting ? "bot-message-wrapper" : ""}`
      } ${
        isHighlighted ? "message--highlighted" : ""
      } ${
        isButton
          ? "cursor-pointer hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5"
          : ""
      }`}
      onClick={isButton ? onClick : undefined}
    >
      {/* Аватарка бота слева (только для бот-сообщений) */}
      {!isUser && showAvatar && (
        <img src={personImage} alt="Bot" className="bot-avatar" />
      )}

      {/* «Пузырь» с содержимым */}
      <div className={`${isUser ? "" : "bubble"} flex flex-col message__text`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                className="message-link"
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
        {/* ========== Таблица, если showTable = true ========== */}
        {showTable && Array.isArray(rawData) && rawData.length > 0 && (
          <div className="overflow-x-auto mt-3 fade-in">
            <table className="min-w-full border border-gray-300 text-sm text-left">
              <thead>
                <tr className="bg-gray-100">
                  {Array.isArray(tableColumns) &&
                    tableColumns.map((col, idx) => (
                      <th
                        key={idx}
                        className="border border-gray-300 px-2 py-1 font-medium"
                      >
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rawData.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {Array.isArray(tableColumns) &&
                      tableColumns.map((col, cIdx) => (
                        <td
                          key={cIdx}
                          className="border border-gray-300 px-2 py-1"
                        >
                          {row[col] ?? "-"}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Excel download block */}
        {hasExcel && excelFile && (
          <div className="file-download-container fade-in mt-2">
            <a
              href="#"
              onClick={async (e) => {
                e.preventDefault();
                try {
                  // excelFile может быть строкой или объектом
                  const fileId =
                    typeof excelFile === "string"
                      ? excelFile
                      : excelFile?.file_id || excelFile?.id;

                  if (!fileId) {
                    console.error("❌ Нет file_id для Excel-файла:", excelFile);
                    return;
                  }

                  const response = await api.get(
                    `/api/excel/download/${fileId}`,
                    {
                      responseType: "blob",
                    },
                  );
                  const blob = new Blob([response.data]);
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download =
                    excelFile?.filename || `data_export_${fileId}.xlsx`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } catch (err) {
                  console.error("Ошибка при скачивании Excel:", err);
                }
              }}
              className="file-download-link"
            >
              <img src={downloadIcon} alt="Excel file" className="file-icon" />
              <span className="file-name">
                {excelFile?.filename
                  ? excelFile.filename
                  : `data_export_${(excelFile?.file_id || excelFile)
                      ?.toString()
                      .slice(0, 8)}.xlsx`}
              </span>
            </a>
          </div>
        )}

        {/* Ссылки на filePaths (если есть) */}
        {!streaming && allFilePaths.length > 0 && (
          <div className="mt-2 fade-in">
            <div className="file-download-container">
              {allFilePaths.map((path, index) => (
                <div key={index} className="file-item">
                  <a
                    href="#"
                    onClick={(e) => handleDownload(e, path)}
                    className="file-download-link"
                  >
                    <img
                      src={downloadIcon}
                      alt="Download file"
                      className="file-icon"
                    />
                    <span className="file-name">{getFileName(path)}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Блок attachments (если есть) */}
        {Array.isArray(attachments) && attachments.length > 0 && (
          <div className="file-download-container fade-in">
            {attachments.map((att) => (
              <div
                key={att.formVersionId}
                className="mb-4 text-sm text-gray-600"
              >
                <p>
                  <strong>{t("binModal.labelIndex")}:</strong> {att.formIndex}
                </p>
                {att.formName && (
                  <p>
                    <strong>{t("binModal.labelName")}:</strong> {att.formName}
                  </p>
                )}
                {att.formDate && (
                  <p>
                    <strong>{t("binModal.labelDeadline")}:</strong>{" "}
                    {att.formDate}
                  </p>
                )}
                {att.formDestination && (
                  <p>
                    <strong>{t("binModal.labelRecipient")}:</strong>{" "}
                    {att.formDestination}
                  </p>
                )}
                {att.formDescription && (
                  <p>
                    <strong>{t("binModal.labelDescription")}:</strong>{" "}
                    {att.formDescription}
                  </p>
                )}
              </div>
            ))}

            {/* Только первый файл – кнопка «скачать» или «готовится» */}
            {(() => {
              const att = attachments[0];
              const isReady = fileReadyMap[att.formVersionId];
              const isLoading = downloadingId === att.formVersionId;

              return !isReady ? (
                <div className="file-download-link flex items-center gap-2 text-sm text-gray-500">
                  <img src={downloadIcon} alt="Loading" className="file-icon" />
                  <span>
                    {t("binModal.preparing")}
                    <span className="typing-container file-typing ml-1">
                      <span className="dot one">.</span>
                      <span className="dot two">.</span>
                      <span className="dot three">.</span>
                    </span>
                  </span>
                </div>
              ) : (
                <button
                  className="file-download-link"
                  disabled={isLoading}
                  onClick={(e) => handleDownloadClick(e, att)}
                >
                  {isLoading ? (
                    <div className="loader" />
                  ) : (
                    <>
                      <img src={downloadIcon} alt="PDF" className="file-icon" />
                      <span className="file-name">
                        {t("binModal.fileName")}
                      </span>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        )}
        {(chart?.chart_id || (chart?.success && rawData?.length > 0)) && (
          <>
            <div
              ref={chartRef}
              id={`chart-${chart.chart_id}`}
              className="chart-container fade-in mt-4 cursor-zoom-in"
              data-id={chart.chart_id}
              style={{ minHeight: 400 }}
              onDoubleClick={() => setShowFullChart(true)} // двойной клик открывает полноэкранный режим
            >
              {!chartReady && (
                <div className="text-gray-400 text-sm">
                  {t("chart.loading")}
                </div>
              )}
            </div>

            {showFullChart && (
              <div
                className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999]"
                onClick={() => setShowFullChart(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                tabIndex={-1}
              >
                <div
                  className="relative w-11/12 h-[90vh] bg-white rounded-lg overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setShowFullChart(false)}
                    className="absolute top-3 right-4 text-white text-3xl z-10"
                  >
                    &times;
                  </button>
                  <div
                    id={`chart-full-${chart.chart_id}`}
                    className="flex items-center justify-center w-full h-full bg-white"
                    ref={(el) => {
                      if (!el || !chartRef.current || !chartReady) return;

                      // Клонируем график
                      const clone = chartRef.current.cloneNode(true);
                      el.innerHTML = "";
                      el.appendChild(clone);

                      const plotRoot =
                        el.querySelector(".js-plotly-plot") ||
                        el.querySelector(".plotly-graph-div");
                      if (!plotRoot) return;

                      // 1. Центрирование контейнера
                      plotRoot.style.display = "flex";
                      plotRoot.style.alignItems = "center";
                      plotRoot.style.justifyContent = "center";
                      plotRoot.style.margin = "auto";
                      plotRoot.style.position = "relative";
                      plotRoot.style.transformOrigin = "center center";

                      // 2. Сбрасываем все фиксированные размеры
                      const all = el.querySelectorAll(
                        ".plot-container, .svg-container, svg, .main-svg",
                      );
                      all.forEach((node) => {
                        node.removeAttribute("width");
                        node.removeAttribute("height");
                        node.style.width = "100%";
                        node.style.height = "100%";
                        node.style.maxWidth = "none";
                        node.style.maxHeight = "none";
                      });

                      // 3. Масштабируем весь график, сохраняя пропорции
                      const containerWidth = el.offsetWidth;
                      const containerHeight = el.offsetHeight;
                      const baseWidth = 628;
                      const baseHeight = 500;
                      const scale = Math.min(
                        containerWidth / baseWidth,
                        containerHeight / baseHeight,
                      );

                      plotRoot.style.width = `${baseWidth}px`;
                      plotRoot.style.height = `${baseHeight}px`;
                      plotRoot.style.transform = `scale(${scale})`;

                      // 4. Центрируем с учётом трансформации
                      plotRoot.style.position = "absolute";
                      plotRoot.style.top = "50%";
                      plotRoot.style.left = "50%";
                      plotRoot.style.transformOrigin = "center center";
                      plotRoot.style.transform = `translate(-50%, -50%) scale(${scale})`;
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== Кнопка «Копировать» ========== */}
        {!isUser &&
          !isGreeting &&
          !isCustomMessage &&
          isAssistantResponse &&
          !streaming &&
          Number.isInteger(botMessageIndex) && (
            <div className="buttons__wrapper fade-in">
              <button
                type="button"
                className={`copy-button flex items-center gap-1 text-sm text-gray-500 transition-colors ${
                  hideCopyTooltip ? "tooltip-hide" : ""
                }`}
                style={{ touchAction: "manipulation", position: "relative" }}
                aria-label={t("copyButton.copy")}
                /* 1) при наведении убираем класс tooltip-hide → CSS-hover показывает тултип */
                onMouseEnter={() => setHideCopyTooltip(false)}
                /* 2) при уходе курсора возвращаем tooltip-hide → CSS скроет тултип */
                onMouseLeave={() => setHideCopyTooltip(true)}
                /* 3) при клике: сразу ставим tooltip-hide, а потом копируем текст */
                onClick={(e) => {
                  handleCopy(e);
                  setHideCopyTooltip(true);
                }}
                onTouchEnd={(e) => {
                  handleCopy(e);
                  setHideCopyTooltip(true);
                }}
              >
                {copied ? (
                  <img src={checkIcon} alt="Check" className="icon-check" />
                ) : (
                  <img src={copyIcon} alt="Copy" className="icon-xs" />
                )}
                {/* Тултип ВСЕГДА есть в DOM, но CSS контролирует видимость */}
                <span className="tooltip">{t("copyButton.copy")}</span>
              </button>
              <FeedbackMessage
                messageIndex={botMessageIndex}
                messageId={messageId}
              />
            </div>
          )}
      </div>
    </div>
  );
}
