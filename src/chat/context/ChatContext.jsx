import axios from "axios";
import React, { createContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import chatI18n from "../i18n";
import faqsData from "../assets/faqs.json";

import {
  getFilePathByBotIndex,
  getFilePaths,
  hasBadFeedbackPrompt,
  isChatDeleted,
  markChatAsDeleted,
  saveBadFeedbackPromptState,
  saveFeedbackState,
  saveMessageId,
} from "../utils/feedbackStorage";
import mockCategories from "./mockCategories.json";

const ChatContext = createContext();

const ChatProvider = ({ children }) => {
  const { t, i18n } = useTranslation(undefined, { i18n: chatI18n });
  const [translationsKz, setTranslationsKz] = useState({});
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [currentSubcategory, setCurrentSubcategory] = useState(null);
  const [inputPrefill, setInputPrefill] = useState("");
  const streamingIndexRef = useRef(null);
  const [isInBinFlow, setIsInBinFlow] = useState(false);
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
  });
  // Новый клиент для B-бэка
  const apiNew = axios.create({
    baseURL: import.meta.env.VITE_API_URL_NEW || "http://172.16.17.4:8001",
    withCredentials: false,
  });
  const USE_STREAMING_API = true;
  // helper: создание backend-сессии (возвращает session_id)
  const getOrCreateUserId = () => {
    try {
      const KEY = "sbr_user_id";
      const stored = localStorage.getItem(KEY);
      if (stored) return stored;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "uid-" +
            Math.random().toString(36).slice(2) +
            Date.now().toString(36);
      localStorage.setItem(KEY, id);
      return id;
    } catch {
      // если localStorage недоступен
      return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "uid-" +
            Math.random().toString(36).slice(2) +
            Date.now().toString(36);
    }
  };
  const [userId] = useState(() => getOrCreateUserId());

  const createBackendSession = async ({ sessionName }) => {
    const payload = {
      user_id: userId,
      session_name: sessionName || "New chat",
    };
    const { data } = await apiNew.post("/api/sessions", payload, {
      headers: { "Content-Type": "application/json" },
      withCredentials: false,
    });
    return data?.session_id;
  };

  const createDefaultChat = () => ({
    id: null,
    title: null,
    messages: [
      {
        text: t("chat.greeting"),
        isUser: false,
        isFeedback: false,
        isButton: false,
        isGreeting: true,
      },
    ],
    lastUpdated: new Date().toISOString(), // Новый параметр активности
    isEmpty: true,
    showInitialButtons: true,
    buttonsWereHidden: false,
    buttonsWereShown: false,
    isBinChat: false,
  });

  function autoDeleteInactiveChats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setChats((prevChats) => {
      // Выделяем дефолтный чат (id === null) отдельно – он не подлежит автоудалению
      const defaultChat = prevChats.find((chat) => chat.id === null);

      // Фильтруем все чаты с id !== null, оставляя только активные (lastUpdated не старше недели)
      const activeNonDefault = prevChats
        .filter((chat) => chat.id !== null)
        .filter((chat) => new Date(chat.lastUpdated) >= weekAgo);

      // Помечаем как удалённые неактивные (только для чатов с id !== null)
      prevChats.forEach((chat) => {
        if (chat.id !== null) {
          const lastUpdatedDate = new Date(chat.lastUpdated);
          if (lastUpdatedDate < weekAgo) {
            markChatAsDeleted(chat.id);
          }
        }
      });

      // Собираем итоговый массив: если дефолтный чат есть, он всегда остается
      const newChats = defaultChat
        ? [defaultChat, ...activeNonDefault]
        : activeNonDefault;

      // Если текущий активный чат удален (или его id нет в новом массиве), переключаемся:
      if (
        currentChatId &&
        !newChats.some((chat) => String(chat.id) === String(currentChatId))
      ) {
        if (activeNonDefault.length > 0) {
          setCurrentChatId(activeNonDefault[0].id);
        } else if (defaultChat) {
          setCurrentChatId(defaultChat.id);
        }
      }

      return newChats;
    });
  }

  const [chats, setChats] = useState(() => [createDefaultChat()]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [locale, setLocale] = useState("ru");

  useEffect(() => {
    setChats((prevChats) =>
      prevChats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.text === chat.messages[0].text
            ? { ...message, text: t("chat.greeting") }
            : message,
        ),
      })),
    );
  }, [i18n.language, t]);

  useEffect(() => {
    let currentLanguage = "ru";
    if (i18n.language === "қаз") currentLanguage = "kz";
    else if (i18n.language === "рус") currentLanguage = "ru";
    else if (i18n.language === "eng") currentLanguage = "en";
    setLocale(currentLanguage);
  }, [i18n.language]);

  const updateFavicon = (lang) => {
    let faviconPath = "/logo_ru.png"; // дефолт

    if (lang === "қаз") faviconPath = "/logo_kz.png";
    if (lang === "рус") faviconPath = "/logo_ru.png";
    if (lang === "eng") faviconPath = "/logo_en.png";

    const favicon = document.getElementById("dynamic-favicon");
    if (favicon) {
      favicon.href = faviconPath;
    } else {
      const link = document.createElement("link");
      link.id = "dynamic-favicon";
      link.rel = "icon";
      link.type = "image/png";
      link.href = faviconPath;
      document.head.appendChild(link);
    }
  };

  const updateLocale = (lang) => {
    let newLocale = "ru";
    if (lang === "қаз") newLocale = "kz";
    if (lang === "рус") newLocale = "ru";
    if (lang === "eng") newLocale = "en";

    setLocale(newLocale);
    i18n.changeLanguage(lang);
    localStorage.setItem("locale", lang);
    updateFavicon(lang);
  };

  const mapLangForNewApi = (loc) => {
    switch (loc) {
      case "kz":
        return "kk";
      case "ru":
        return "ru";
      case "en":
        return "en";
      default:
        return "ru"; // fallback
    }
  };

  const fetchChatHistory = async (sessionId, limit = 50) => {
    try {
      // NEW B-backend: GET /api/sessions/{session_id}/history?limit=50
      const { data } = await apiNew.get(`/api/sessions/${sessionId}/history`, {
        params: { limit },
      });

      const baseMessages = (data?.messages || []).map((m) => {
        // UPDATED: history теперь может содержать display_data – используем его для таблицы
        const hasDisplayData =
          Array.isArray(m?.display_data) && m.display_data.length > 0;

        const tableColumns =
          hasDisplayData && m.display_data[0]
            ? Object.keys(m.display_data[0])
            : Array.isArray(m?.table_columns)
            ? m.table_columns
            : [];

        const rawData = hasDisplayData
          ? m.display_data
          : Array.isArray(m?.raw_data)
          ? m.raw_data
          : [];

        return {
          text: m?.content ?? "",
          isUser: m?.role === "user",
          isFeedback: false,
          isButton: false,
          timestamp: m?.timestamp,

          // Excel — как в онлайн-ответе
          hasExcel: !!m?.has_excel,
          excelFile: m?.has_excel
            ? {
                file_id: m?.excel_file_id,
                filename: m?.excel_filename,
              }
            : null,

          // Chart — передаём chart_id и явный success:false,
          // чтобы Message.jsx пошёл по ветке загрузки /api/charts/{chart_id}
          hasChart: !!m?.has_chart,
          chart: m?.has_chart
            ? {
                chart_id: m?.chart_id,
                chart_type: m?.chart_type,
                success: false, // UPDATED: явно помечаем как "исторический" график без rawData
              }
            : null,

          // Таблица / данные — при наличии display_data строим таблицу,
          // иначе остаёмся на старой логике show_table/raw_data
          showTable: hasDisplayData ? true : !!m?.show_table,
          tableColumns,
          rawData,
        };
      });

      // UPDATED: гарантируем сохранение message_id для всех сообщений ассистента
      try {
        let botIndex = 0;
        (data?.messages || []).forEach((m) => {
          if (m?.role === "assistant" && m?.id) {
            saveMessageId(sessionId, botIndex, m.id);
            console.log("💾 stored message_id:", {
              chat: sessionId,
              botIndex,
              message_id: m.id,
            });
            botIndex++;
          }
        });
      } catch (err) {
        console.error("restore message_id failed:", err);
      }

      // восстановление filePaths для бот-ответов
      const savedFilePaths = getFilePaths(sessionId);
      let botIndex = 0;
      const withFiles = baseMessages.map((msg, idx) => {
        if (!msg.isUser) {
          const pathsByBot = getFilePathByBotIndex(sessionId, botIndex) || [];
          const savedByIdx = Array.isArray(savedFilePaths[idx])
            ? savedFilePaths[idx]
            : savedFilePaths[idx]
            ? [savedFilePaths[idx]]
            : [];
          botIndex += 1;
          return {
            ...msg,
            filePaths: [
              ...new Set([
                ...(msg.filePaths || []),
                ...pathsByBot,
                ...savedByIdx,
              ]),
            ],
          };
        }
        return msg;
      });

      // добавляем флаг isAssistantResponse туда, где это просто обычный ответ ассистента
      const normalized = withFiles.map((message) => {
        if (
          !message.isUser &&
          !message.isFeedback &&
          !message.badFeedbackPrompt &&
          !message.isCustomMessage
        ) {
          return { ...message, isAssistantResponse: true };
        }
        return message;
      });

      // вставим «приглашение к регистрации проблемы», если оно сохранено ранее
      if (hasBadFeedbackPrompt(sessionId)) {
        normalized.push({
          text: t("feedback.badFeedbackPromptText"),
          isUser: false,
          isFeedback: false,
          badFeedbackPrompt: true,
          isAssistantResponse: false,
        });
      }

      const withCharts = await Promise.all(
        normalized.map(async (msg) => {
          if (msg.hasChart && msg.chart?.chart_id && !msg.chart?.success) {
            try {
              const chartRes = await apiNew.get(
                `/api/charts/${msg.chart.chart_id}`,
              );
              const chartData = chartRes.data;
              return {
                ...msg,
                chart: {
                  ...msg.chart,
                  ...chartData,
                  success: true,
                },
              };
            } catch (e) {
              console.error("Ошибка загрузки графика:", e);
              return msg;
            }
          }
          return msg;
        }),
      );

      return {
        session_id: sessionId,
        messages: withCharts,
        message_count: data?.message_count ?? withCharts.length,
      };
    } catch (error) {
      console.error("Error fetching chat history:", error);
      throw error;
    }
  };

  const cacheMessageIdsFromHistory = async (sessionId) => {
    try {
      if (!sessionId) return;

      const { data } = await apiNew.get(`/api/sessions/${sessionId}/history`, {
        params: { limit: 50 },
      });

      let botIndex = 0;
      (data?.messages || []).forEach((m) => {
        if (m?.role === "assistant" && m?.id) {
          saveMessageId(sessionId, botIndex, m.id);
          console.log("💾 cached message_id from history:", {
            chat: sessionId,
            botIndex,
            message_id: m.id,
          });
          botIndex++;
        }
      });
    } catch (error) {
      console.error("Error caching message ids from history:", error);
    }
  };

  const removeBadFeedbackMessage = () => {
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && currentChatId === null)
        ) {
          return {
            ...chat,
            messages: chat.messages.filter((msg) => !msg.badFeedbackPrompt),
          };
        }
        return chat;
      }),
    );
  };

  const fetchMyChats = async () => {
    try {
      const { data } = await apiNew.get(`/api/sessions/${userId}`);
      // ожидаем { sessions: [{ id, name, created_at, updated_at, message_count }], total_count }
      return Array.isArray(data?.sessions) ? data.sessions : [];
    } catch (error) {
      console.error("Error fetching my chats:", error);
      throw error;
    }
  };

  useEffect(() => {
    const loadAndCleanChats = async () => {
      try {
        const sessions = await fetchMyChats();
        const filtered = sessions.filter((s) => !isChatDeleted(s.id));

        setChats((prevChats) => {
          const defaultChat =
            prevChats.find((c) => c.id === null) || createDefaultChat();
          const mapped = filtered.map((s) => ({
            ...createDefaultChat(),
            id: s.id,
            title: s.name || t("sidebar.newChat"),
            lastUpdated:
              s.updated_at || s.created_at || new Date().toISOString(),
            isEmpty: false,
          }));
          return [defaultChat, ...mapped];
        });

        autoDeleteInactiveChats();
      } catch (error) {
        console.error("Error loading existing chats:", error);
        setChats((prevChats) => {
          const defaultChat = prevChats.find((c) => c.id === null);
          return defaultChat ? [defaultChat] : [createDefaultChat()];
        });
      }
    };

    loadAndCleanChats();
  }, []); // запуск один раз при монтировании

  const fetchInitialMessages = async () => {
    const USE_MOCK_CATEGORIES = false;

    if (categories.length > 0) {
      updateChatWithExistingCategories();
      return;
    }

    try {
      let fetchedCategories = []; // Initialize with empty array
      let fetchedTranslations = {};

      if (USE_MOCK_CATEGORIES) {
        // берём данные из локального mockCategories.json
        fetchedCategories = mockCategories.categories || [];
        fetchedTranslations = mockCategories.translations_kz || {};
      }
      // } else {
      //   // реальный вызов на бэкенд
      //   const res = await api.get("/assistant/categories");
      //   fetchedCategories = res.data?.categories || [];
      //   fetchedTranslations = res.data?.translations_kz || {};
      // }

      setCategories(fetchedCategories);
      setTranslationsKz(fetchedTranslations);

      // Only call updateChatWithCategories if we have categories
      if (fetchedCategories && fetchedCategories.length > 0) {
        updateChatWithCategories(fetchedCategories);
      } else {
        console.warn(
          "No categories fetched, skipping updateChatWithCategories",
        );
      }
    } catch (error) {
      console.error("Ошибка при загрузке начальных сообщений:", error);
      // Set empty arrays to prevent undefined errors
      setCategories([]);
      setTranslationsKz({});
    }
  };

  //const fetchInitialMessages = async () => {
  //   // Проверяем, есть ли у нас уже загруженные категории
  //   if (categories.length > 0) {
  //      updateChatWithExistingCategories();
  //      return;
  //   }

  //   try {
  //      let fetchedCategories;
  //      let fetchedTranslations;

  //      // === TEST STUB: вместо реального запроса подставляем JSON с faq для проверки ===
  //      if (import.meta.env.DEV) {
  //         const testData = {
  //            categories: [],
  //            translations_kz: {
  //               "Общие вопросы": "Жалпы сұрақтар",
  //               определение: "анықтама",
  //               цель: "мақсат",
  //               срок: "мерзім",
  //               "метод проведения": "өткізу әдісі",
  //               охват: "қамту",
  //               "закон (основание)": "заң (негіз)",
  //               этап: "кезең",
  //               защита: "қорғау",
  //               "уполномоченный орган": "уәкілетті орган",
  //               роль: "рөл",
  //               интервьюер: "сұхбатшы",
  //               "история СХП": "АӨШ тарихы",
  //               "переписные листы": "санақ парақтары",
  //               "Заполнение переписных листов": "Санақ парақтарын толтыру",
  //               "3-ЛПХ": "3-ЖШҚ",
  //               "2-СХП (КФХ)": "2-АӨШ (КФШ)",
  //               "Общие вопросы по опросу": "Сұрау бойынша жалпы сұрақтар",
  //               "Сайт Санак.гов": "Санак.гов сайты",
  //               Авторизация: "Авторизация",
  //               "Пользовательская ошибка": "Пайдаланушы қатесі",
  //               Регистрация: "Тіркеу",
  //               NCALayer: "NCALayer",
  //            },
  //         };
  //         fetchedCategories = testData.categories;
  //         fetchedTranslations = testData.translations_kz;
  //      } else {
  //         // реальный вызов на бэкенд
  //         const res = await api.get(`/assistant/categories`);
  //         fetchedCategories = res.data.categories;
  //         fetchedTranslations = res.data.translations_kz || {};
  //      }

  //      // общая логика по записи в стейт и рендеру кнопок
  //      setCategories(fetchedCategories);
  //      setTranslationsKz(fetchedTranslations);
  //      updateChatWithCategories(fetchedCategories);
  //   } catch (error) {
  //      console.error("Ошибка при загрузке начальных сообщений:", error);
  //   }
  //};

  async function deleteChat(chatId) {
    // 1) Локально помечаем как удалённый (как и раньше)
    markChatAsDeleted(chatId);

    // 2) Оптимистичное удаление из списка + переключение активного
    const prev = chats;
    setChats((prevChats) => {
      const newChats = prevChats.filter(
        (chat) => String(chat.id) !== String(chatId),
      );
      if (String(currentChatId) === String(chatId)) {
        if (newChats.length > 0) {
          setCurrentChatId(newChats[newChats.length - 1].id);
        } else {
          const newChat = createDefaultChat();
          newChats.push(newChat);
          setCurrentChatId(newChat.id);
        }
      }
      return newChats;
    });

    // 3) Бэкенд: DELETE /api/sessions/{session_id}
    try {
      await apiNew.delete(`/api/sessions/${chatId}`, {
        headers: { Accept: "application/json" },
        withCredentials: false,
      });
    } catch (e) {
      console.error("Backend delete failed, rolling back:", e);
      // если упало — откатываем локально
      setChats(prev);
    }
  }

  const updateChatWithCategories = (fetchedCategories) => {
    // Safety check: ensure fetchedCategories is an array
    if (!fetchedCategories || !Array.isArray(fetchedCategories)) {
      console.warn(
        "updateChatWithCategories: fetchedCategories is not a valid array:",
        fetchedCategories,
      );
      return;
    }

    setChats((prev) =>
      prev.map((chat) => {
        if (
          chat.isEmpty &&
          (String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null))
        ) {
          return {
            ...chat,
            messages: [
              chat.messages[0],
              ...fetchedCategories.slice(0, 4).map((cat) => ({
                text:
                  i18n.language === "қаз"
                    ? translationsKz[cat.name] || cat.name
                    : cat.name,
                isUser: true,
                isFeedback: false,
                isButton: true,
                category: cat,
              })),
            ],
            buttonsWereShown: true,
          };
        }
        return chat;
      }),
    );
  };

  const updateChatWithExistingCategories = () => {
    setChats((prev) =>
      prev.map((chat) => {
        if (
          chat.isEmpty &&
          (String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null))
        ) {
          const categoryButtons = categories.slice(0, 4).map((cat) => ({
            text:
              i18n.language === "қаз"
                ? translationsKz[cat.name] || cat.name
                : cat.name,
            isUser: true,
            isFeedback: false,
            isButton: true,
            name: cat.name,
            category: cat,
            subcategories: cat.subcategories,
            faq: cat.faq,
          }));

          return {
            ...chat,
            messages: [chat.messages[0], ...categoryButtons],
            buttonsWereShown: true,
          };
        }
        return chat;
      }),
    );
  };

  useEffect(() => {
    if (currentChatId === null) {
      if (currentSubcategory) {
        // Если есть выбранная подкатегория, показываем её reports
        handleButtonClick({
          ...currentSubcategory,
          subcategory: true,
          category: currentCategory,
        });
      } else if (currentCategory) {
        // Если есть только категория, показываем её содержимое
        handleButtonClick(currentCategory);
      } else if (categories.length > 0) {
        // Если ничего не выбрано, показываем начальные категории
        updateChatWithExistingCategories();
      }
    }
  }, [i18n.language]);

  // Обновляем useEffect для отслеживания переключения чатов
  useEffect(() => {
    const currentChat = chats.find(
      (c) =>
        String(c.id) === String(currentChatId) ||
        (c.id === null && currentChatId === null),
    );

    // Загружаем кнопки только если чат пустой и кнопки ещё не были загружены
    if (currentChat?.isEmpty && !currentChat.buttonsWereShown) {
      fetchInitialMessages();
    }
  }, [currentChatId]);

  useEffect(() => {
    // если мы в дефолтном (пустом) чате и категории уже есть
    if (
      currentChatId === null &&
      !currentCategory &&
      !currentSubcategory &&
      categories.length > 0
    ) {
      updateChatWithExistingCategories();
    }
  }, [i18n.language, categories]);

  const createNewChat = () => {
    // Сброс текущего состояния
    setCurrentCategory(null);
    setCurrentSubcategory(null);
    setCategoryFilter(null);

    // Создаём новый дефолтный чат
    const newChat = createDefaultChat();

    setChats((prev) => {
      // Добавляем в начало, чтобы он был первым и активным
      const updated = [newChat, ...prev.filter((c) => c.id !== null)];
      return updated;
    });

    // Сбрасываем текущий чат
    setCurrentChatId(null);

    // Явно перезагружаем кнопки приветствия
    fetchInitialMessages();

    console.log("🆕 Новый чат создан");
  };

  const switchChat = async (chatId) => {
    setCurrentCategory(null);
    setCurrentSubcategory(null);
    setCategoryFilter(null);
    if (String(chatId) === String(currentChatId)) {
      return;
    }

    try {
      if (chatId !== null) {
        const chatHistory = await fetchChatHistory(chatId);

        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (String(chat.id) === String(chatId)) {
              return {
                ...chat,
                messages: [
                  // Сохраняем приветственное сообщение
                  chat.messages[0],
                  ...chatHistory.messages,
                ],
                title: chatHistory?.title ?? chat.title,
                isEmpty: false,
                showInitialButtons: false,
                buttonsWereHidden: true,
              };
            }
            return chat;
          }),
        );
      }

      setCurrentChatId(chatId);
    } catch (error) {
      console.error("Error switching chat:", error);
    }
  };

  async function createMessageStatic(
    text,
    isFeedback = false,
    additionalParams = {},
  ) {
    if (!text) return;

    const {
      category: apCategory,
      subcategory: apSubcategory,
      subcategory_report: apSubReport,
    } = additionalParams;
    setIsTyping(true);

    // 1️⃣ Добавляем сообщение пользователя
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && chat === prevChats[0])
        ) {
          return {
            ...chat,
            isEmpty: false,
            lastUpdated: new Date().toISOString(),
            messages: [
              ...chat.messages.filter((msg) => !msg.isButton),
              { text, isUser: true, isFeedback },
            ],
          };
        }
        return chat;
      }),
    );

    // 2️⃣ Добавляем временное сообщение ассистента
    const tempAssistantMessage = {
      text: "",
      isUser: false,
      isFeedback: false,
      filePaths: [],
      hasLineBreaks: false,
      isAssistantResponse: true,
      streaming: true,
    };

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && chat === prevChats[0])
        ) {
          return {
            ...chat,
            messages: [...chat.messages, tempAssistantMessage],
          };
        }
        return chat;
      }),
    );

    try {
      // Функция обновления текста последнего сообщения
      const updateLastMessage = (newText, streamingFlag = true) => {
        const formattedText = newText.replace(/\\n/g, "\n");
        setChats((prevChats) =>
          prevChats.map((chat) => {
            const idx = chat.messages.findIndex((msg) => msg.streaming);
            if (idx === -1) return chat;
            const updatedMsg = {
              ...chat.messages[idx],
              text: formattedText,
              streaming: streamingFlag,
            };
            const updatedMessages = [...chat.messages];
            updatedMessages[idx] = updatedMsg;
            return { ...chat, messages: updatedMessages };
          }),
        );
      };

      let accumulatedText = "";

      // 3️⃣ Гарантируем наличие session_id
      let sessionId = currentChatId;
      if (!sessionId) {
        const sessionName = text || "New chat";
        sessionId = await createBackendSession({ sessionName });
        if (sessionId) {
          setCurrentChatId(sessionId);
          setChats((prev) => {
            const ci = prev.findIndex((c) =>
              c.messages.some((m) => m.streaming),
            );
            if (ci === -1) return prev;
            const updated = {
              ...prev[ci],
              id: sessionId,
              title: prev[ci].title ?? sessionName,
              isEmpty: false,
            };
            const copy = [...prev];
            copy[ci] = updated;
            return copy;
          });

          // UPDATED: сразу обновляем имя сессии на сервере
          try {
            await apiNew.put(`/api/sessions/${sessionId}/name`, {
              session_name: sessionName,
            });
            console.log("📝 session name updated:", sessionName);
          } catch (err) {
            console.error("Ошибка при обновлении имени сессии:", err);
          }
        }
      }

      const findFaqIdByText = (text) => {
        if (!faqsData?.faqs) return null;
        const normalized = text.toLowerCase().trim();
        for (const f of faqsData.faqs) {
          const qru = f.questions?.ru?.toLowerCase?.() || "";
          const qkk = f.questions?.kk?.toLowerCase?.() || "";
          const qen = f.questions?.en?.toLowerCase?.() || "";
          if (normalized === qru || normalized === qkk || normalized === qen) {
            return f.faq_id;
          }
        }
        return null;
      };

      const body = {
        query: text,
        session_id: sessionId || null,
        user_id: userId,
        language: mapLangForNewApi(locale),
        faq_id: findFaqIdByText(text) || null, // ✅ добавлен faq_id
      };

      const { data } = await apiNew.post("/api/chat", body, {
        headers: { "Content-Type": "application/json" },
        withCredentials: false,
      });

      console.log("💬 /api/chat static response:", data);

      const {
        response: answer,
        session_id: sid,
        sql_query,
        raw_data,
        error: isError,
        message_id,
        chart,
        has_excel,
        excel_file,
        show_table,
        table_columns,
      } = data || {};

      accumulatedText += typeof answer === "string" ? answer : "";
      updateLastMessage(accumulatedText, false);

      // 5️⃣ Обновляем последнее сообщение ассистента
      setChats((prev) => {
        const ci = prev.findIndex((c) =>
          c.messages.some((m) => m.isAssistantResponse),
        );
        if (ci === -1) return prev;

        let msgIdx = -1;
        for (let i = prev[ci].messages.length - 1; i >= 0; i--) {
          if (prev[ci].messages[i].isAssistantResponse) {
            msgIdx = i;
            break;
          }
        }
        if (msgIdx === -1) return prev;

        const updatedMsg = {
          ...prev[ci].messages[msgIdx],
          text: accumulatedText,
          streaming: false,
          isAssistantResponse: true,
          sqlQuery: sql_query || "",
          rawData: Array.isArray(raw_data) ? raw_data : [],
          chart: chart?.success ? chart : null,
          isError: !!isError,
          excelFile: excel_file || null,
          hasExcel: has_excel || false,
          showTable: show_table || false,
          tableColumns: table_columns || [],
        };

        const updatedMessages = [...prev[ci].messages];
        updatedMessages[msgIdx] = updatedMsg;

        const chatUpdated = {
          ...prev[ci],
          messages: updatedMessages,
          id: sid || prev[ci].id,
          title: prev[ci].title ?? (text || "New chat"),
          lastUpdated: new Date().toISOString(),
        };

        return [...prev.slice(0, ci), chatUpdated, ...prev.slice(ci + 1)];
      });

      // 6️⃣ Сохраняем message_id
      try {
        if (sid && message_id) {
          saveMessageId(sid, 0, message_id);
        }
      } catch (err) {
        console.error("Ошибка при сохранении message_id:", err);
      }

      if (sid) {
        setCurrentChatId(sid);
      }
    } catch (error) {
      console.error("Ошибка запроса:", error);
      const errorMessage = {
        text: t("chatError.errorMessage"),
        isUser: false,
        isFeedback,
      };
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && chat === prevChats[0])
          ) {
            return { ...chat, messages: [...chat.messages, errorMessage] };
          }
          return chat;
        }),
      );
    } finally {
      setIsTyping(false);
    }
  }

  const handleButtonClick = (selectedItem) => {
    console.log("Selected item:", selectedItem);

    if (selectedItem.isSubcategory) {
      const categoryData = selectedItem.category || currentCategory;
      setCurrentCategory(categoryData);
      setCurrentSubcategory(selectedItem);
      setCategoryFilter(categoryData.name);

      // Прячем старые кнопки и готовим FAQ-кнопки
      setChats((prevChats) =>
        prevChats.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;

          // Собираем кнопки FAQ по этой категории
          const faqButtons = (categoryData.faq || []).map((f, i) => ({
            text:
              i18n.language === "қаз"
                ? translationsKz[f.question] || f.question
                : f.question,
            isUser: true,
            isFeedback: false,
            isButton: true,
            isFaq: true,
            faqData: f,
            key: `faq-${i}`,
          }));

          return {
            ...chat,
            showInitialButtons: false,
            buttonsWereHidden: true,
            // Оставляем только приветствие + все FAQ-кнопки
            messages: [chat.messages[0], ...faqButtons],
          };
        }),
      );
      // Пользователь введёт запрос вручную, и createMessage подтянет currentCategory/subcategory
      return;
    }

    // 2. Отчёт
    if (selectedItem.isReport) {
      const categoryData = currentCategory;
      setCategoryFilter(categoryData.name);
      createMessage(selectedItem.text, false, {
        category: categoryData.name,
        subcategory: currentSubcategory?.name ?? null,
        subcategory_report: selectedItem.reportText,
      });
      return;
    }

    // 4. Категория
    // 3. FAQ — предзаполняем инпут и скрываем кнопки
    if (selectedItem.isFaq) {
      setInputPrefill(selectedItem.text);
      setChats((prev) =>
        prev.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;
          return {
            ...chat,
            showInitialButtons: false,
            buttonsWereHidden: true,
            messages: [chat.messages[0]],
          };
        }),
      );
      return;
    }

    // 4. Категория — сначала подкатегории, потом FAQ, иначе заглушка
    const categoryData = selectedItem.category || selectedItem;
    setCurrentCategory(categoryData);
    setCurrentSubcategory(null);
    setCategoryFilter(categoryData.name);

    if (categoryData.subcategories?.length > 0) {
      // Показываем кнопки подкатегорий
      setChats((prev) =>
        prev.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;

          const subButtons = categoryData.subcategories.map((sub) => ({
            text:
              locale === "ru" ? sub.name : translationsKz[sub.name] || sub.name,
            isUser: true,
            isFeedback: false,
            isButton: true,
            isSubcategory: true,
            name: sub.name,
            category: categoryData,
          }));

          return {
            ...chat,
            showInitialButtons: false,
            buttonsWereHidden: true,
            messages: [chat.messages[0], ...subButtons],
          };
        }),
      );
    } else if (categoryData.faq?.length > 0) {
      // Показываем кнопки FAQ, если нет подкатегорий
      setChats((prev) =>
        prev.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;

          const faqButtons = categoryData.faq.map((f, i) => ({
            text:
              i18n.language === "қаз"
                ? translationsKz[f.question] || f.question
                : f.question,
            isUser: true,
            isFeedback: false,
            isButton: true,
            isFaq: true,
            faqData: f,
            key: `faq-${i}`,
          }));

          return {
            ...chat,
            showInitialButtons: false,
            buttonsWereHidden: true,
            messages: [chat.messages[0], ...faqButtons],
          };
        }),
      );
    } else {
      // Ни подкатегорий, ни FAQ — fallback
      setChats((prev) =>
        prev.map((chat) => {
          const isCurrent =
            String(chat.id) === String(currentChatId) ||
            (chat.id === null && currentChatId === null);
          if (!isCurrent) return chat;
          return {
            ...chat,
            showInitialButtons: false,
            buttonsWereHidden: true,
            messages: [chat.messages[0]],
          };
        }),
      );
    }
  };

  async function createMessageStreaming(
    text,
    isFeedback = false,
    additionalParams = {},
  ) {
    if (!text) return;

    setIsTyping(true);

    // === добавляем сообщение пользователя ===
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && chat === prevChats[0])
        ) {
          return {
            ...chat,
            isEmpty: false,
            lastUpdated: new Date().toISOString(),
            messages: [
              ...chat.messages.filter((msg) => !msg.isButton),
              { text, isUser: true, isFeedback },
            ],
          };
        }
        return chat;
      }),
    );

    // === временное сообщение ассистента ===
    const tempAssistant = {
      text: "",
      isUser: false,
      isFeedback: false,
      isAssistantResponse: true,
      streaming: true,
    };

    setChats((prev) =>
      prev.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && chat === prev[0])
        ) {
          return { ...chat, messages: [...chat.messages, tempAssistant] };
        }
        return chat;
      }),
    );

    try {
      const useMock = false;
      let reader;
      let decoder = new TextDecoder("utf-8");

      // sessionId нужен и внутри цикла, и в обработке complete
      let sessionId = currentChatId;

      if (useMock) {
        const mockStream = await import("../../streamMock.json").then(
          (m) => m.default,
        );
        let index = 0;
        reader = {
          async read() {
            if (index < mockStream.length) {
              const line = "data: " + JSON.stringify(mockStream[index]) + "\n";
              index++;
              await new Promise((r) => setTimeout(r, 70));
              return { done: false, value: new TextEncoder().encode(line) };
            }
            return { done: true };
          },
        };
      } else {
        // гарантируем наличие session_id
        if (!sessionId) {
          const sessionName = text || "New chat";

          sessionId = await createBackendSession({ sessionName });

          if (sessionId) {
            setCurrentChatId(sessionId);
            setChats((prev) => {
              const ci = prev.findIndex((c) =>
                c.messages.some((m) => m.streaming),
              );
              if (ci === -1) return prev;
              const updated = {
                ...prev[ci],
                id: sessionId,
                title: prev[ci].title ?? sessionName,
                isEmpty: false,
              };
              const copy = [...prev];
              copy[ci] = updated;
              return copy;
            });

            try {
              await apiNew.put(`/api/sessions/${sessionId}/name`, {
                session_name: sessionName,
              });
              console.log("📝 session name updated:", sessionName);
            } catch (err) {
              console.error("Ошибка при обновлении имени сессии:", err);
            }
          }
        }

        const findFaqIdByText = (text) => {
          if (!faqsData?.faqs) return null;
          const normalized = text.toLowerCase().trim();
          for (const f of faqsData.faqs) {
            const qru = f.questions?.ru?.toLowerCase?.() || "";
            const qkk = f.questions?.kk?.toLowerCase?.() || "";
            const qen = f.questions?.en?.toLowerCase?.() || "";
            if (
              normalized === qru ||
              normalized === qkk ||
              normalized === qen
            ) {
              return f.faq_id;
            }
          }
          return null;
        };

        const response = await fetch(
          `${
            import.meta.env.VITE_API_URL_NEW || "http://172.16.17.4:8001"
          }/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: text,
              session_id: sessionId || null,
              user_id: userId,
              language: mapLangForNewApi(locale),
              faq_id: findFaqIdByText(text) || null,
            }),
          },
        );
        reader = response.body.getReader();
      }

      // === читаем поток ===
      let buffer = "";
      let accumulatedText = "";

      // сюда сохраним данные для saveMessageId после цикла
      let lastBotIndexForSave = null;
      let lastSessionForSave = null;
      let lastMessageIdForSave = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n");
        buffer = parts.pop();

        for (const line of parts) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          const parsed = JSON.parse(json);

          if (parsed.type === "text") {
            const chunkText =
              typeof parsed.content === "string"
                ? parsed.content
                : typeof parsed.content === "object"
                ? Object.values(parsed.content).join(" ")
                : String(parsed.content || "");

            accumulatedText += chunkText;

            setChats((prev) =>
              prev.map((chat) => {
                const idx = chat.messages.findIndex((m) => m.streaming);
                if (idx === -1) return chat;

                const updated = {
                  ...chat.messages[idx],
                  text: accumulatedText,
                  streaming: true,
                };

                const copy = [...chat.messages];
                copy[idx] = updated;
                return { ...chat, messages: copy };
              }),
            );
          } else if (parsed.type === "complete") {
            // Бэкенд может присылать данные как в корне, так и во вложенном response
            const respObject =
              parsed &&
              typeof parsed.response === "object" &&
              parsed.response !== null
                ? parsed.response
                : {};

            // Текст ответа:
            // - либо parsed.response как строка
            // - либо respObject.response
            const textFromResponse =
              typeof parsed.response === "string"
                ? parsed.response
                : typeof respObject.response === "string"
                ? respObject.response
                : "";

            const safeResponse = textFromResponse || "";

            // session_id: сначала берём из вложенного объекта, потом из корня
            const sidFromResponse =
              respObject.session_id ||
              parsed.session_id ||
              sessionId ||
              currentChatId;

            // message_id: сначала из вложенного объекта, потом из корня
            const msgId = respObject.message_id || parsed.message_id || null;

            setChats((prev) =>
              prev.map((chat) => {
                const idx = chat.messages.findIndex((m) => m.streaming);
                if (idx === -1) return chat;

                const updated = {
                  ...chat.messages[idx],
                  text: safeResponse,
                  streaming: false,
                  chart: parsed.chart || respObject.chart || null,
                  excelFile: parsed.excel_file || respObject.excel_file || null,
                  hasExcel:
                    parsed.has_excel ||
                    respObject.has_excel ||
                    !!respObject.excel_file ||
                    false,
                  showTable:
                    parsed.show_table || respObject.show_table || false,
                  tableColumns:
                    parsed.table_columns || respObject.table_columns || [],
                  rawData: parsed.raw_data || respObject.raw_data || [],
                };

                const copy = [...chat.messages];
                copy[idx] = updated;

                // вычисляем botIndex для нового ответа и сохраняем данные
                if (
                  sidFromResponse &&
                  msgId &&
                  String(chat.id) === String(sidFromResponse)
                ) {
                  const assistantCount = copy.filter(
                    (m) => !m.isUser && !m.isFeedback,
                  ).length;
                  lastBotIndexForSave = Math.max(assistantCount - 1, 0);
                  lastSessionForSave = sidFromResponse;
                  lastMessageIdForSave = msgId;
                }

                return { ...chat, messages: copy };
              }),
            );
          } else if (parsed.type === "end") {
            setIsTyping(false);
          }
        }
      }

      // Сохраняем message_id → потом FeedbackMessage сможет его достать
      if (
        lastSessionForSave &&
        lastMessageIdForSave &&
        lastBotIndexForSave !== null
      ) {
        try {
          saveMessageId(
            lastSessionForSave,
            lastBotIndexForSave,
            lastMessageIdForSave,
          );
          console.log("💾 stored live message_id:", {
            chat: lastSessionForSave,
            botIndex: lastBotIndexForSave,
            message_id: lastMessageIdForSave,
          });
        } catch (e) {
          console.error("Ошибка сохранения message_id:", e);
        }
      }
    } catch (err) {
      console.error("Ошибка при мок-стриминге:", err);
      setIsTyping(false);
    }
  }

  const removeFeedbackMessage = (messageIndex) => {
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (
          chat.id === currentChatId ||
          (chat.id === null && currentChatId === null)
        ) {
          return {
            ...chat,
            messages: chat.messages.filter((msg, index) => {
              // Если это сообщение фидбека для конкретного индекса - удаляем его
              if (msg.isFeedback) {
                const botMessageIndex = getBotMessageIndex(
                  index,
                  chat.messages,
                );
                return botMessageIndex !== messageIndex;
              }
              return true;
            }),
          };
        }
        return chat;
      }),
    );
  };

  const getBotMessageIndex = (currentIndex) => {
    const currentChat = chats.find(
      (c) =>
        String(c.id) === String(currentChatId) ||
        (c.id === null && c === chats[0]),
    );

    if (!currentChat) return null;

    const messages = currentChat.messages;

    if (!messages[currentIndex]?.isFeedback) {
      return null;
    }

    // Пропускаем первое приветственное сообщение
    let messageCount = -1; // Начинаем с -1, чтобы первая пара начиналась с 0

    for (let i = 1; i < currentIndex; i++) {
      // Начинаем с 1, пропуская приветствие
      const message = messages[i];

      // Пропускаем фидбек сообщения
      if (message.isFeedback) {
        continue;
      }

      messageCount++;
    }

    // Возвращаем индекс бота (каждый второй индекс)
    return Math.floor(messageCount / 2) * 2 + 1;
  };
  // UPDATED: фикс запроса на B-бэк (ChatContext.jsx)
  const sendFeedback = async (messageId, rate, text) => {
    try {
      if (!messageId) {
        console.warn("sendFeedback: messageId отсутствует");
        return;
      }

      const currentChat = chats.find(
        (c) =>
          String(c.id) === String(currentChatId) ||
          (c.id === null && c === chats[0]),
      );
      if (!currentChat?.id) {
        console.warn("sendFeedback: нет session_id для текущего чата");
        return;
      }

      const baseURL =
        import.meta.env.VITE_API_URL_NEW || "http://172.16.17.4:8001";
      const feedbackType = rate === "good" ? "like" : "dislike";

      const payload = {
        session_id: currentChat.id,
        user_id: userId,
        feedback_type: feedbackType,
        feedback_text: text || "",
      };

      console.log("➡️ Отправка фидбека:", {
        url: `${baseURL}/api/messages/${messageId}/feedback`,
        payload,
      }); // UPDATED debug

      const response = await axios.post(
        `${baseURL}/api/messages/${messageId}/feedback`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: false,
        },
      );

      console.log("✅ Ответ от сервера:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ Ошибка при отправке фидбека:", error);
    }
  };

  const addBotMessage = (text) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (
          String(chat.id) === String(currentChatId) ||
          (chat.id === null && chat === prev[0])
        ) {
          return {
            ...chat,
            messages: [
              ...chat.messages,
              {
                text,
                isUser: false,
                isFeedback: false,
              },
            ],
          };
        }
        return chat;
      }),
    );
  };

  // 2) Добавление в чат «кнопочных» сообщений
  const addButtonMessages = (buttons) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (String(chat.id) === String(currentChatId)) {
          return { ...chat, messages: [...chat.messages, ...buttons] };
        }
        return chat;
      }),
    );
  };

  // === Отладка chart ===
  useEffect(() => {
    const currentChat = chats.find(
      (c) =>
        String(c.id) === String(currentChatId) ||
        (c.id === null && currentChatId === null),
    );
    if (!currentChat) return;

    const lastMessage = currentChat.messages[currentChat.messages.length - 1];
    if (lastMessage?.chart && lastMessage.chart.success) {
      console.log("📊 Chart detected:", lastMessage.chart);
      console.log("📈 chart_html:", lastMessage.chart.chart_html);
    }
  }, [chats, currentChatId]);

  const createMessage = USE_STREAMING_API
    ? createMessageStreaming
    : createMessageStatic;

  return (
    <ChatContext.Provider
      value={{
        chats,
        currentChatId,
        isTyping,
        setIsTyping,
        createNewChat,
        switchChat,
        createMessage,
        handleButtonClick,
        sendFeedback,
        getBotMessageIndex,
        removeFeedbackMessage,
        inputPrefill,
        setInputPrefill,
        showInitialButtons:
          chats.find(
            (c) =>
              String(c.id) === String(currentChatId) ||
              (c.id === null && c === chats[0]),
          )?.showInitialButtons || false,
        updateLocale,
        addButtonMessages,
        deleteChat,
        addBotMessage,
        setChats,
        removeBadFeedbackMessage,
        isInBinFlow,
        setIsInBinFlow,
        cacheMessageIdsFromHistory,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export { ChatContext, ChatProvider };
