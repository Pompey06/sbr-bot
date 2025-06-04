import { createContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import mockCategories from "./mockCategories.json";
import { useTranslation } from "react-i18next";
import {
   hasFeedback,
   saveFeedbackState,
   hasBadFeedbackPrompt,
   saveBadFeedbackPromptState,
   getFilePaths,
   saveFilePath,
   getFilePathByBotIndex,
   isChatDeleted,
   markChatAsDeleted,
} from "../utils/feedbackStorage";
import chatI18n from "../i18n";

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
      withCredentials: true, // <-- добавлено
   });

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
         const newChats = defaultChat ? [defaultChat, ...activeNonDefault] : activeNonDefault;

         // Если текущий активный чат удален (или его id нет в новом массиве), переключаемся:
         if (currentChatId && !newChats.some((chat) => String(chat.id) === String(currentChatId))) {
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
               message.text === chat.messages[0].text ? { ...message, text: t("chat.greeting") } : message
            ),
         }))
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

   const fetchChatHistory = async (chatId) => {
      try {
         const response = await api.get(`/conversation/by-id/${chatId}`);

         const formattedMessages = response.data.messages.map((message) => ({
            text: message.text,
            isUser: message.type === "user",
            isFeedback: false,
            isButton: false,
         }));

         let messagesWithFeedback = [];

         const savedFilePaths = getFilePaths(chatId);
         console.log("Saved file paths for chat", chatId, ":", savedFilePaths);

         let botIndex = 0;
         formattedMessages.forEach((message, index) => {
            if (!message.isUser) {
               // Получаем filePaths по индексу бота
               const paths = getFilePathByBotIndex(chatId, botIndex);
               console.log(`Bot message ${botIndex}, paths:`, paths);

               if (paths && paths.length > 0) {
                  message.filePaths = paths;
               }

               // Также проверяем сохраненные пути по индексу сообщения
               if (savedFilePaths[index] && savedFilePaths[index].length > 0) {
                  const existingPaths = message.filePaths || [];
                  const newPaths = Array.isArray(savedFilePaths[index])
                     ? savedFilePaths[index]
                     : [savedFilePaths[index]];

                  message.filePaths = [...new Set([...existingPaths, ...newPaths])];
               }

               botIndex++;
            }

            messagesWithFeedback.push(message);
         });

         if (hasBadFeedbackPrompt(chatId)) {
            messagesWithFeedback.push({
               text: t("feedback.badFeedbackPromptText"),
               isUser: false,
               isFeedback: false,
               badFeedbackPrompt: true,
            });
         }

         // Здесь добавляем флаг isAssistantResponse для подходящих сообщений
         messagesWithFeedback = messagesWithFeedback.map((message) => {
            // Если сообщение не от пользователя, не является фидбеком,
            // не имеет кастомных флагов (например, для регистрации)
            if (!message.isUser && !message.isFeedback && !message.badFeedbackPrompt && !message.isCustomMessage) {
               return { ...message, isAssistantResponse: true };
            }
            return message;
         });

         return {
            ...response.data,
            messages: messagesWithFeedback,
         };
      } catch (error) {
         console.error("Error fetching chat history:", error);
         throw error;
      }
   };

   const removeBadFeedbackMessage = () => {
      setChats((prevChats) =>
         prevChats.map((chat) => {
            if (String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null)) {
               return {
                  ...chat,
                  messages: chat.messages.filter((msg) => !msg.badFeedbackPrompt),
               };
            }
            return chat;
         })
      );
   };

   const fetchMyChats = async () => {
      try {
         const response = await api.get(`/conversation/my`);
         return response.data;
      } catch (error) {
         console.error("Error fetching my chats:", error);
         throw error;
      }
   };

   useEffect(() => {
      const loadAndCleanChats = async () => {
         try {
            const myChats = await fetchMyChats();
            const filteredChats = myChats.filter((chat) => !isChatDeleted(chat.id));

            setChats((prevChats) => {
               const defaultChat = prevChats.find((c) => c.id === null);
               return [
                  defaultChat,
                  ...filteredChats.map((chat) => ({
                     ...createDefaultChat(),
                     id: chat.id,
                     title: chat.title,
                     isEmpty: false,
                  })),
               ];
            });
            // После загрузки чатов запускаем автоматическое удаление неактивных
            autoDeleteInactiveChats();
         } catch (error) {
            console.error("Error loading existing chats:", error);
         }
      };

      loadAndCleanChats();
   }, []);

   const fetchInitialMessages = async () => {
      const USE_MOCK_CATEGORIES = false;

      if (categories.length > 0) {
         updateChatWithExistingCategories();
         return;
      }

      try {
         let fetchedCategories;
         let fetchedTranslations;

         if (USE_MOCK_CATEGORIES) {
            // берём данные из локального mockCategories.json
            fetchedCategories = mockCategories.categories;
            fetchedTranslations = mockCategories.translations_kz || {};
         } else {
            // реальный вызов на бэкенд
            const res = await api.get("/assistant/categories");
            fetchedCategories = res.data.categories;
            fetchedTranslations = res.data.translations_kz || {};
         }

         setCategories(fetchedCategories);
         setTranslationsKz(fetchedTranslations);
         updateChatWithCategories(fetchedCategories);
      } catch (error) {
         console.error("Ошибка при загрузке начальных сообщений:", error);
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

   function deleteChat(chatId) {
      // Помечаем чат как удалённый в localStorage
      markChatAsDeleted(chatId);

      setChats((prevChats) => {
         // Фильтруем чаты, удаляя чат с данным chatId
         const newChats = prevChats.filter((chat) => String(chat.id) !== String(chatId));

         // Если удалённый чат был активным
         if (String(currentChatId) === String(chatId)) {
            if (newChats.length > 0) {
               // Переключаемся на самый новый чат (последний элемент массива)
               setCurrentChatId(newChats[newChats.length - 1].id);
            } else {
               // Если удалён последний чат, создаем новый пустой чат
               const newChat = createDefaultChat();
               newChats.push(newChat);
               setCurrentChatId(newChat.id);
            }
         }

         return newChats;
      });
   }

   const updateChatWithCategories = (fetchedCategories) => {
      setChats((prev) =>
         prev.map((chat) => {
            if (
               chat.isEmpty &&
               (String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null))
            ) {
               return {
                  ...chat,
                  messages: [
                     chat.messages[0],
                     ...fetchedCategories.slice(0, 4).map((cat) => ({
                        text: i18n.language === "қаз" ? translationsKz[cat.name] || cat.name : cat.name,
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
         })
      );
   };

   const updateChatWithExistingCategories = () => {
      setChats((prev) =>
         prev.map((chat) => {
            if (
               chat.isEmpty &&
               (String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null))
            ) {
               const categoryButtons = categories.slice(0, 4).map((cat) => ({
                  text: i18n.language === "қаз" ? translationsKz[cat.name] || cat.name : cat.name,
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
         })
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
         (c) => String(c.id) === String(currentChatId) || (c.id === null && currentChatId === null)
      );

      // Загружаем кнопки только если чат пустой и кнопки ещё не были загружены
      if (currentChat?.isEmpty && !currentChat.buttonsWereShown) {
         fetchInitialMessages();
      }
   }, [currentChatId]);

   useEffect(() => {
      // если мы в дефолтном (пустом) чате и категории уже есть
      if (currentChatId === null && !currentCategory && !currentSubcategory && categories.length > 0) {
         updateChatWithExistingCategories();
      }
   }, [i18n.language, categories]);

   const createNewChat = () => {
      const currentChat = chats.find(
         (c) => String(c.id) === String(currentChatId) || (c.id === null && currentChatId === null)
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
            })
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
            })
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
                        title: chatHistory.title,
                        isEmpty: false,
                        showInitialButtons: false,
                        buttonsWereHidden: true,
                     };
                  }
                  return chat;
               })
            );
         }

         setCurrentChatId(chatId);
      } catch (error) {
         console.error("Error switching chat:", error);
      }
   };

   // Пример изменённой функции createMessage в ChatContext:
   async function createMessage(text, isFeedback = false, additionalParams = {}) {
      if (!text) return;

      // Находим текущий чат
      const currentChat = chats.find(
         (c) => String(c.id) === String(currentChatId) || (c.id === null && c === chats[0])
      );

      const { category: apCategory, subcategory: apSubcategory, subcategory_report: apSubReport } = additionalParams;

      const params = {
         prompt: text,
         locale,
         category: apCategory ?? currentCategory?.name ?? null,
         subcategory: apSubcategory ?? currentSubcategory?.name ?? null,
         subcategory_report: apSubReport ?? null,
      };

      if (currentChat && currentChat.id) {
         params.conversation_id = currentChat.id;
      }

      setIsTyping(true);

      // Шаг 1. Добавляем сообщение пользователя в чат
      setChats((prevChats) =>
         prevChats.map((chat) => {
            if (String(chat.id) === String(currentChatId) || (chat.id === null && chat === prevChats[0])) {
               return {
                  ...chat,
                  isEmpty: false,
                  lastUpdated: new Date().toISOString(),
                  messages: [...chat.messages.filter((msg) => !msg.isButton), { text, isUser: true, isFeedback }],
               };
            }
            return chat;
         })
      );

      // Шаг 2. Добавляем временное сообщение-ответ от ассистента с пустым текстом
      // Это сообщение будет обновляться при стриминге
      const tempAssistantMessage = {
         text: "",
         isUser: false,
         isFeedback: false,
         filePaths: [],
         hasLineBreaks: false,
         isAssistantResponse: true,
         streaming: true, // Флаг, что сообщение находится в режиме стриминга
      };

      setChats((prevChats) =>
         prevChats.map((chat) => {
            if (String(chat.id) === String(currentChatId) || (chat.id === null && chat === prevChats[0])) {
               return {
                  ...chat,
                  messages: [...chat.messages, tempAssistantMessage],
               };
            }
            return chat;
         })
      );

      try {
         // Шаг 3. Отправляем запрос через Fetch, ОТФИЛЬТРОВАВ null-значения
         const searchParams = new URLSearchParams();
         Object.entries(params).forEach(([key, value]) => {
            // добавляем только непустые параметры
            if (value !== null && value !== undefined) {
               searchParams.append(key, value);
            }
         });
         const url = `${import.meta.env.VITE_API_URL}/assistant/ask?${searchParams.toString()}`;
         const response = await fetch(url, {
            method: "POST",
            credentials: "include",
         });

         if (!response.ok) {
            throw new Error("Network response was not ok");
         }

         const reader = response.body.getReader();
         const decoder = new TextDecoder();
         let done = false;
         let accumulatedText = "";

         const updateLastMessage = (newText, streamingFlag = true) => {
            // Преобразуем экранированные "\n" в реальные переводы строк
            const formattedText = newText.replace(/\\n/g, "\n");

            setChats((prevChats) =>
               prevChats.map((chat) => {
                  const idx = chat.messages.findIndex((msg) => msg.streaming);
                  if (idx === -1) return chat;
                  const streamingMsg = chat.messages[idx];
                  const updatedMsg = {
                     ...streamingMsg,
                     text: formattedText + (streamingFlag ? " |" : ""),
                     streaming: streamingFlag,
                  };
                  const updatedMessages = [...chat.messages];
                  updatedMessages[idx] = updatedMsg;
                  return { ...chat, messages: updatedMessages };
               })
            );
         };

         // Шаг 4. Чтение потока
         while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunk = decoder.decode(value, { stream: !done });
            // Предполагаем, что чанки разделены переносами строки
            const lines = chunk.split("\n");
            for (const line of lines) {
               const trimmed = line.trim();
               if (!trimmed) continue;

               if (trimmed.startsWith("0:")) {
                  // Обработка текстового чанка
                  const textFragment = trimmed.slice(2).replace(/^"|"$/g, "");
                  accumulatedText += textFragment;
                  updateLastMessage(accumulatedText, true);
                  // Задержка для имитации печати
                  await new Promise((resolve) => setTimeout(resolve, 50));
               } else if (trimmed.startsWith("2:")) {
                  try {
                     const jsonObj = JSON.parse(trimmed.slice(2));

                     if (jsonObj.type === "conversation") {
                        // ваша существующая логика для conversation
                        const { id: convId, title: convTitle } = jsonObj.conversation;
                        setCurrentChatId(convId);
                        setChats((prevChats) => {
                           // 1) Найдём индекс чата, где сейчас идёт стрим
                           const idx = prevChats.findIndex((chat) => chat.messages.some((msg) => msg.streaming));
                           if (idx === -1) {
                              // на всякий случай, если что-то пошло не так
                              return prevChats;
                           }
                           // 2) Сформируем новую версию только этого чата
                           const updated = {
                              ...prevChats[idx],
                              id: convId,
                              title: convTitle,
                           };
                           // 3) Воссоздадим массив, заменив только элемент idx
                           return [...prevChats.slice(0, idx), updated, ...prevChats.slice(idx + 1)];
                        });
                     } else if (jsonObj.type === "relevant_documents") {
                        // ваша существующая логика для документов
                        setChats((prevChats) =>
                           prevChats.map((chat) => {
                              const idx = chat.messages.findIndex((msg) => msg.streaming);
                              if (idx === -1) return chat;
                              const updated = [...chat.messages];
                              updated[idx] = { ...updated[idx], filePaths: jsonObj.documents || [] };
                              return { ...chat, messages: updated };
                           })
                        );
                     } else if (jsonObj.type === "final_text") {
                        // когда приходит окончательный текст — обновляем текст, но не снимаем флаг streaming
                        const final = jsonObj.final_text;
                        updateLastMessage(final, true);
                     } else if (jsonObj.type === "status") {
                        console.log("Status chunk:", jsonObj.status);
                     }
                  } catch (error) {
                     console.error("Ошибка парсинга JSON 2-чанка:", error);
                  }
               } else if (trimmed.startsWith("d:")) {
                  // Завершение потока — убираем курсор и флаг streaming
                  updateLastMessage(accumulatedText, false);
               }
            }
         }
      } catch (error) {
         console.error("Ошибка стриминга:", error);
         const errorMessage = {
            text: t("chatError.errorMessage"),
            isUser: false,
            isFeedback,
         };
         setChats((prevChats) =>
            prevChats.map((chat) => {
               if (String(chat.id) === String(currentChatId) || (chat.id === null && chat === prevChats[0])) {
                  return { ...chat, messages: [...chat.messages, errorMessage] };
               }
               return chat;
            })
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
                  String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null);
               if (!isCurrent) return chat;

               // Собираем кнопки FAQ по этой категории
               const faqButtons = (categoryData.faq || []).map((f, i) => ({
                  text: f.question,
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
            })
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
                  String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null);
               if (!isCurrent) return chat;
               return {
                  ...chat,
                  showInitialButtons: false,
                  buttonsWereHidden: true,
                  messages: [chat.messages[0]],
               };
            })
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
                  String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null);
               if (!isCurrent) return chat;

               const subButtons = categoryData.subcategories.map((sub) => ({
                  text: locale === "ru" ? sub.name : translationsKz[sub.name] || sub.name,
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
            })
         );
      } else if (categoryData.faq?.length > 0) {
         // Показываем кнопки FAQ, если нет подкатегорий
         setChats((prev) =>
            prev.map((chat) => {
               const isCurrent =
                  String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null);
               if (!isCurrent) return chat;

               const faqButtons = categoryData.faq.map((f, i) => ({
                  text: f.question,
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
            })
         );
      } else {
         // Ни подкатегорий, ни FAQ — fallback
         setChats((prev) =>
            prev.map((chat) => {
               const isCurrent =
                  String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null);
               if (!isCurrent) return chat;
               return {
                  ...chat,
                  showInitialButtons: false,
                  buttonsWereHidden: true,
                  messages: [chat.messages[0]],
               };
            })
         );
      }
   };

   const removeFeedbackMessage = (messageIndex) => {
      setChats((prevChats) =>
         prevChats.map((chat) => {
            if (chat.id === currentChatId || (chat.id === null && currentChatId === null)) {
               return {
                  ...chat,
                  messages: chat.messages.filter((msg, index) => {
                     // Если это сообщение фидбека для конкретного индекса - удаляем его
                     if (msg.isFeedback) {
                        const botMessageIndex = getBotMessageIndex(index, chat.messages);
                        return botMessageIndex !== messageIndex;
                     }
                     return true;
                  }),
               };
            }
            return chat;
         })
      );
   };

   const getBotMessageIndex = (currentIndex) => {
      const currentChat = chats.find(
         (c) => String(c.id) === String(currentChatId) || (c.id === null && c === chats[0])
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
            (c) => String(c.id) === String(currentChatId) || (c.id === null && c === chats[0])
         );
         if (!currentChat) throw new Error("Chat not found");

         const response = await api.post(`/conversation/by-id/${currentChat.id}/add-feedback`, {
            message_index: messageIndex,
            rate: rate,
            text: text,
         });

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
                  if (String(chat.id) === String(currentChatId) || (chat.id === null && currentChatId === null)) {
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
               })
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
            if (String(chat.id) === String(currentChatId) || (chat.id === null && chat === prev[0])) {
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
         })
      );
   };

   //const updateChatLastUpdated = (chatId, newDate) => {
   //   setChats((prevChats) =>
   //      prevChats.map((chat) => (String(chat.id) === String(chatId) ? { ...chat, lastUpdated: newDate } : chat))
   //   );
   //};

   //if (typeof window !== "undefined") {
   //   window.updateChatLastUpdated = updateChatLastUpdated;
   //}

   //window.updateChatLastUpdated("68021ab9ed98616d690aeca4", "2025-04-01T00:00:00.000Z"); - как меняем дату через консоль

   //и ещё для проверки удаления неактивных чатов нужно autoDeleteInactiveChats передать в sidebar и раскоментировать вызов внутри handleNewChat

   // В вашем ChatContext.js
   // Обновлённая версия fetchFormsByBin, теперь принимает год из модалки

   const fetchFormsByBin = async (bin, year = new Date().getFullYear()) => {
      const lang = i18n.language === "қаз" ? "kk" : "ru";

      try {
         // 1) Немедленно получаем перечень форм
         const res = await api.get("/begunok/form", {
            params: { bin, year, lang },
         });
         const forms = res.data;

         // 2) Параллельно в фоне запускаем предзаказ (order_report)
         (async () => {
            try {
               // Делаем предзаказ только для первой формы
               if (forms.length > 0) {
                  const first = forms[0];
                  const orderRes = await api.post("/begunok/order_report", null, {
                     params: { bin, year, lang, formVersionId: first.formVersionId },
                  });
                  const enriched = [
                     { ...first, order_id: orderRes.data.order_id, filename: orderRes.data.filename },
                     ...forms.slice(1),
                  ];

                  // Обновляем только attachments в сообщениях
                  setChats((prevChats) =>
                     prevChats.map((chat) => {
                        const msgs = chat.messages.map((msg) =>
                           msg.attachments ? { ...msg, attachments: enriched } : msg
                        );
                        return { ...chat, messages: msgs };
                     })
                  );
               }
            } catch (err) {
               console.error("[pre-order_report error]", err);
            }
         })();

         // 4) Возвращаем исходный список сразу — UI отрисует его без задержки
         return forms;
      } catch (err) {
         console.error("Error fetching forms by BIN:", err);
         throw err;
      }
   };

   //const fetchFormsByBin = async (bin, year = new Date().getFullYear()) => {
   //   console.log("⚙️ [MOCK] fetchFormsByBin called with BIN:", bin, "year:", year);

   //   return mockForms;
   //};

   // 2) Добавление в чат «кнопочных» сообщений
   const addButtonMessages = (buttons) => {
      setChats((prev) =>
         prev.map((chat) => {
            if (String(chat.id) === String(currentChatId)) {
               return { ...chat, messages: [...chat.messages, ...buttons] };
            }
            return chat;
         })
      );
   };

   const downloadForm = (bin, formVersionId, orderId, filename) => {
      const lang = i18n.language === "қаз" ? "kk" : "ru";
      const baseUrl = import.meta.env.VITE_API_URL;
      // Формируем прямой URL к отчету
      const url = `${baseUrl}/begunok/report?order_id=${orderId}&lang=${lang}`;
      // Открываем в новой вкладке — браузер сам отрендерит inline PDF
      window.open(url, "_blank");
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
               chats.find((c) => String(c.id) === String(currentChatId) || (c.id === null && c === chats[0]))
                  ?.showInitialButtons || false,
            updateLocale,
            fetchFormsByBin,
            addButtonMessages,
            downloadForm,
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
