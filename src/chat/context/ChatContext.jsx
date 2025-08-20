import axios from "axios";
import React, { createContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import chatI18n from "../i18n";
import {
  getFilePathByBotIndex,
  getFilePaths,
  hasBadFeedbackPrompt,
  isChatDeleted,
  markChatAsDeleted,
  saveBadFeedbackPromptState,
  saveFeedbackState,
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
  const [userId] = useState(getOrCreateUserId);

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
    const currentLanguage = i18n.language === "қаз" ? "kz" : "ru";
    setLocale(currentLanguage);
  }, [i18n.language]);

  const updateLocale = (lang) => {
    const newLocale = lang === "қаз" ? "kz" : "ru";
    setLocale(newLocale);
    i18n.changeLanguage(lang);
    localStorage.setItem("locale", lang);
  };

  const mapLangForNewApi = (loc) => (loc === "kz" ? "kk" : "ru");

  const fetchChatHistory = async (sessionId, limit = 50) => {
    try {
      // NEW B-backend: GET /api/sessions/{session_id}/history?limit=50
      const { data } = await apiNew.get(`/api/sessions/${sessionId}/history`, {
        params: { limit },
      });

      // ожидаем data.messages: [{ id, role: 'assistant'|'user', content, timestamp, user_id }]
      const baseMessages = (data?.messages || []).map((m) => ({
        text: m?.content ?? "",
        isUser: m?.role === "user",
        isFeedback: false,
        isButton: false,
        timestamp: m?.timestamp,
      }));

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

      return {
        session_id: sessionId,
        messages: normalized,
        message_count: data?.message_count ?? normalized.length,
      };
    } catch (error) {
      console.error("Error fetching chat history:", error);
      throw error;
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
    const currentChat = chats.find(
      (c) =>
        String(c.id) === String(currentChatId) ||
        (c.id === null && currentChatId === null),
    );
    if (currentChat?.isBinChat) {
      // сбрасываем режим BIN и создаём новый дефолтный чат
      setIsInBinFlow(false);
      const newChat = createDefaultChat();
      // помещаем его в начало, чтобы find(c => c.id===null) вернул именно его
      setChats((prev) => [newChat, ...prev]);
      // явно делаем его активным
      setCurrentChatId(newChat.id); // newChat.id === null, но гарантированно первый
      fetchInitialMessages();
      return;
    }
    setCurrentCategory(null);
    setCurrentSubcategory(null);
    setCategoryFilter(null);

    // Если мы в пустом чате - перезагружаем его состояние
    if (currentChat?.isEmpty) {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.isEmpty) {
            return {
              ...createDefaultChat(),
              id: null,
              isEmpty: true,
              buttonsWereShown: false,
            };
          }
          return chat;
        }),
      );
      fetchInitialMessages(); // Добавляем явный вызов
      return;
    }

    // Находим существующий пустой чат
    const emptyChat = chats.find((c) => c.isEmpty);

    // Если есть пустой чат - переключаемся на него и перезагружаем кнопки
    if (emptyChat) {
      setCurrentChatId(null);
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.isEmpty) {
            return {
              ...createDefaultChat(),
              id: null,
              isEmpty: true,
              buttonsWereShown: false,
            };
          }
          return chat;
        }),
      );
      fetchInitialMessages(); // Добавляем явный вызов
      return;
    }

    // Если нет пустого чата - создаём новый
    const newChat = createDefaultChat();
    setChats((prev) => [...prev, newChat]);
    setCurrentChatId(null);
    fetchInitialMessages(); // Добавляем явный вызов
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

  async function createMessage(
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
      const updateLastMessage = (newText, streamingFlag = true) => {
        const formattedText = newText.replace(/\\n/g, "\n");

        setChats((prevChats) =>
          prevChats.map((chat) => {
            const idx = chat.messages.findIndex((msg) => msg.streaming);
            if (idx === -1) return chat;
            const updatedMsg = {
              ...chat.messages[idx],
              text: formattedText + (streamingFlag ? " |" : ""),
              streaming: streamingFlag,
            };
            const updatedMessages = [...chat.messages];
            updatedMessages[idx] = updatedMsg;
            return { ...chat, messages: updatedMessages };
          }),
        );
      };

      let accumulatedText = "";

      // === Новый однократный JSON-эндпойнт на B-бэке ===
      let currentChatRef = chats.find(
        (c) =>
          String(c.id) === String(currentChatId) ||
          (c.id === null && c === chats[0]),
      );
      // Если у текущего чата ещё нет id — создаём сессию заранее
      if (!currentChatRef?.id) {
        // Название можно сделать из первых символов запроса
        const sessionName = (text || "New chat").slice(0, 50);
        const sid = await createBackendSession({ sessionName });
        if (sid) {
          setCurrentChatId(sid);
          setChats((prev) => {
            // обновим первый/текущий пустой чат id'шником
            const idx = prev.findIndex(
              (c) =>
                String(c.id) === String(currentChatId) ||
                (c.id === null && c === prev[0]),
            );
            if (idx === -1) return prev;
            const updated = {
              ...prev[idx],
              id: sid,
              title: sessionName,
              isEmpty: false,
            };
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
          });
          // пересчитаем ссылку
          currentChatRef = { ...currentChatRef, id: sid };
        }
      }

      const body = {
        query: text,
        session_id: currentChatRef?.id || null, // теперь почти всегда уже есть
        user_id: userId,
        language: mapLangForNewApi(locale),
      };

      const { data } = await apiNew.post("/api/chat", body, {
        headers: { "Content-Type": "application/json" },
        withCredentials: false,
      });
      const {
        response: answer,
        session_id: sid,
        sql_query,
        raw_data,
        error: isError,
      } = data || {};

      // Текст ответа (или текст ошибки от бэка)
      accumulatedText += typeof answer === "string" ? answer : "";
      updateLastMessage(accumulatedText, false);

      // Проставить доп. поля (sql/raw) на последнее бот-сообщение
      setChats((prev) => {
        const ci = prev.findIndex((c) => c.messages.some((m) => m.streaming));
        if (ci === -1) return prev;
        const msgIdx = prev[ci].messages.findIndex((m) => m.streaming);
        const updatedMsg = {
          ...prev[ci].messages[msgIdx],
          text: accumulatedText,
          streaming: false,
          // новые поля из B-бэка
          sqlQuery: sql_query || "",
          rawData: Array.isArray(raw_data) ? raw_data : [],
          isError: !!isError,
        };
        const messages = [...prev[ci].messages];
        messages[msgIdx] = updatedMsg;
        const chatUpdated = {
          ...prev[ci],
          messages,
          ...(sid
            ? {
                id: sid,
                title: prev[ci].title ?? (text || "New chat").slice(0, 50),
              }
            : {}),
          lastUpdated: new Date().toISOString(),
        };
        return [...prev.slice(0, ci), chatUpdated, ...prev.slice(ci + 1)];
      });

      // Зафиксировать/обновить session_id как текущий id чата
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

  const sendFeedback = async (rate, text, messageIndex) => {
    try {
      const currentChat = chats.find(
        (c) =>
          String(c.id) === String(currentChatId) ||
          (c.id === null && c === chats[0]),
      );
      if (!currentChat) throw new Error("Chat not found");

      const response = await api.post(
        `/conversation/by-id/${currentChat.id}/add-feedback`,
        {
          message_index: messageIndex,
          rate: rate,
          text: text,
        },
      );

      // Сохраняем информацию об отправленном фидбеке
      saveFeedbackState(currentChat.id, messageIndex, rate);
      // Удаляем сообщение с фидбеком из чата
      setTimeout(() => {
        removeFeedbackMessage(messageIndex);
      }, 0);

      // Если пользователь отправил плохой отзыв, добавляем сообщение для регистрации
      if (rate === "bad") {
        saveBadFeedbackPromptState(currentChat.id);
        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (
              String(chat.id) === String(currentChatId) ||
              (chat.id === null && currentChatId === null)
            ) {
              return {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    text: t("feedback.badFeedbackPromptText"), // "Для регистрации заполните форму ниже"
                    isUser: false,
                    isFeedback: false,
                    badFeedbackPrompt: true,
                    isCustomMessage: true,
                  },
                ],
              };
            }
            return chat;
          }),
        );
      }

      return response.data;
    } catch (error) {
      console.error("Error sending feedback:", error);
      throw error;
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export { ChatContext, ChatProvider };
