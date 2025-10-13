// utils/feedbackStorage.js

// Ключи для localStorage
const FEEDBACK_STORAGE_KEY = "chat_feedback_state";
const BAD_FEEDBACK_PROMPT_KEY = "chat_bad_feedback_prompt";
const FILE_PATHS_KEY = "chat_file_paths";
const DELETED_CHATS_KEY = "deleted_chats";

/**
 * Получить весь объект с состоянием фидбека (лайк/дизлайк) из localStorage.
 * Если данных нет или JSON некорректен — возвращает пустой объект.
 * Структура: { [chatId]: { [messageIndex]: "good"|"bad", … }, … }
 */
export const getFeedbackState = () => {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

/**
 * Сохранить тип фидбека для конкретного сообщения в конкретном чате.
 * @param {string} chatId - ID чата
 * @param {number} messageIndex - Индекс сообщения
 * @param {"good"|"bad"} type - Тип фидбека
 */
export const saveFeedbackState = (chatId, messageIndex, type) => {
  const currentState = getFeedbackState();

  if (!currentState[chatId]) {
    currentState[chatId] = {};
  }
  currentState[chatId][messageIndex] = type;
  localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(currentState));
};

/**
 * Проверить, есть ли фидбек для конкретного сообщения в данном чате.
 * Возвращает true, если в объекте хранится "good" или "bad".
 * @param {string} chatId - ID чата
 * @param {number} messageIndex - Индекс сообщения
 * @returns {boolean}
 */
export const hasFeedback = (chatId, messageIndex) => {
  const state = getFeedbackState();
  return !!state[chatId] && state[chatId][messageIndex] !== undefined;
};

/**
 * Получить тип фидбека ("good" или "bad") для конкретного сообщения в чате.
 * Если фидбека нет — возвращает null.
 * @param {string} chatId - ID чата
 * @param {number} messageIndex - Индекс сообщения
 * @returns {"good"|"bad"|null}
 */
export const getFeedbackType = (chatId, messageIndex) => {
  const state = getFeedbackState();
  if (!state[chatId]) return null;
  return state[chatId][messageIndex] || null;
};

/**
 * Удалить фидбек для конкретного сообщения в чате (если нужно).
 * @param {string} chatId - ID чата
 * @param {number} messageIndex - Индекс сообщения
 */
export const clearFeedbackForMessage = (chatId, messageIndex) => {
  const state = getFeedbackState();
  if (state[chatId] && state[chatId][messageIndex] !== undefined) {
    delete state[chatId][messageIndex];
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(state));
  }
};

// ==================== Функции для работы с BadFeedbackPrompt ====================

/**
 * Получить объект состояния подсказок для «плохого» фидбека (one-time prompt).
 * Возвращает { [chatId]: true }.
 */
export const getBadFeedbackPromptState = () => {
  try {
    return JSON.parse(localStorage.getItem(BAD_FEEDBACK_PROMPT_KEY)) || {};
  } catch {
    return {};
  }
};

/**
 * Сохранить, что для данного чата уже показали prompt «плохого» фидбека.
 * @param {string} chatId - ID чата
 */
export const saveBadFeedbackPromptState = (chatId) => {
  const currentState = getBadFeedbackPromptState();
  currentState[chatId] = true;
  localStorage.setItem(BAD_FEEDBACK_PROMPT_KEY, JSON.stringify(currentState));
};

/**
 * Проверить, показан ли уже prompt «плохого» фидбека для данного чата.
 * @param {string} chatId - ID чата
 * @returns {boolean}
 */
export const hasBadFeedbackPrompt = (chatId) => {
  const state = getBadFeedbackPromptState();
  return !!state[chatId];
};

// ==================== Функции для работы с filePaths (оставляем без изменений) ====================

export const getFilePathsState = () => {
  try {
    return JSON.parse(localStorage.getItem(FILE_PATHS_KEY)) || {};
  } catch {
    return {};
  }
};

export const saveFilePath = (chatId, messageIndex, filePath) => {
  const currentState = getFilePathsState();
  if (!currentState[chatId]) {
    currentState[chatId] = {};
  }
  const pathsArray = Array.isArray(filePath) ? filePath : [filePath];
  currentState[chatId][messageIndex] = pathsArray;
  localStorage.setItem(FILE_PATHS_KEY, JSON.stringify(currentState));
};

export const getFilePaths = (chatId) => {
  const state = getFilePathsState();
  return state[chatId] || {};
};

export const saveFilePathByBotIndex = (chatId, botIndex, filePath) => {
  try {
    const filePaths = getFilePathsState();
    if (!filePaths[chatId]) {
      filePaths[chatId] = {};
    }
    const pathsArray = Array.isArray(filePath) ? filePath : [filePath];
    filePaths[chatId][`bot_${botIndex}`] = pathsArray;
    localStorage.setItem(FILE_PATHS_KEY, JSON.stringify(filePaths));
  } catch (error) {
    console.error("Error saving file paths:", error);
  }
};

export const getFilePathByBotIndex = (chatId, botIndex) => {
  try {
    const filePaths = getFilePathsState();
    const paths = filePaths[chatId]?.[`bot_${botIndex}`];
    if (!paths) return [];
    return Array.isArray(paths) ? paths : [paths];
  } catch (error) {
    console.error("Error getting file paths:", error);
    return [];
  }
};

export const addFilePath = (chatId, messageIndex, filePath) => {
  const currentState = getFilePathsState();
  if (!currentState[chatId]) {
    currentState[chatId] = {};
  }
  if (!currentState[chatId][messageIndex]) {
    currentState[chatId][messageIndex] = [];
  } else if (!Array.isArray(currentState[chatId][messageIndex])) {
    currentState[chatId][messageIndex] = [currentState[chatId][messageIndex]];
  }
  if (!currentState[chatId][messageIndex].includes(filePath)) {
    currentState[chatId][messageIndex].push(filePath);
  }
  localStorage.setItem(FILE_PATHS_KEY, JSON.stringify(currentState));
};

export const addFilePathByBotIndex = (chatId, botIndex, filePath) => {
  try {
    const filePaths = getFilePathsState();
    if (!filePaths[chatId]) {
      filePaths[chatId] = {};
    }
    const botKey = `bot_${botIndex}`;
    if (!filePaths[chatId][botKey]) {
      filePaths[chatId][botKey] = [];
    } else if (!Array.isArray(filePaths[chatId][botKey])) {
      filePaths[chatId][botKey] = [filePaths[chatId][botKey]];
    }
    if (!filePaths[chatId][botKey].includes(filePath)) {
      filePaths[chatId][botKey].push(filePath);
    }
    localStorage.setItem(FILE_PATHS_KEY, JSON.stringify(filePaths));
  } catch (error) {
    console.error("Error adding file path:", error);
  }
};

export const clearFilePaths = (chatId) => {
  const currentState = getFilePathsState();
  if (currentState[chatId]) {
    delete currentState[chatId];
    localStorage.setItem(FILE_PATHS_KEY, JSON.stringify(currentState));
  }
};

// ==================== Функции для пометки удалённых чатов (оставляем без изменений) ====================

export function getDeletedChats() {
  try {
    const data = JSON.parse(localStorage.getItem(DELETED_CHATS_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function markChatAsDeleted(chatId) {
  const deletedChats = getDeletedChats();
  if (!deletedChats.includes(chatId)) {
    deletedChats.push(chatId);
    localStorage.setItem(DELETED_CHATS_KEY, JSON.stringify(deletedChats));
  }
}

export function isChatDeleted(chatId) {
  return getDeletedChats().includes(chatId);
}

// ====== NEW: хранение соответствия messageIndex -> message_id ======
const MESSAGE_ID_MAP_KEY = "chat_message_ids";

const getMessageIdMap = () => {
  try {
    return JSON.parse(localStorage.getItem(MESSAGE_ID_MAP_KEY)) || {};
  } catch {
    return {};
  }
};

const setMessageIdMap = (map) => {
  localStorage.setItem(MESSAGE_ID_MAP_KEY, JSON.stringify(map));
};

/** Сохранить message_id для сообщения бота по индексу */
export const saveMessageId = (chatId, messageIndex, messageId) => {
  if (!chatId || messageIndex == null || !messageId) return;
  const map = getMessageIdMap();
  if (!map[chatId]) map[chatId] = {};
  map[chatId][messageIndex] = messageId;
  setMessageIdMap(map);
};

/** Получить message_id по индексу сообщения бота */
export const getMessageIdByIndex = (chatId, messageIndex) => {
  const map = getMessageIdMap();
  return map[chatId]?.[messageIndex] || null;
};
