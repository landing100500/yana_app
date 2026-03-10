-- Таблица логов запросов к чату: какой пользователь, топик, сообщения и в какие области памяти обращался ИИ.
-- Выполнять в основной БД приложения (MySQL).
CREATE TABLE IF NOT EXISTS chat_request_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  userId INT UNSIGNED NOT NULL,
  topicId INT UNSIGNED NOT NULL,
  userMessageId INT UNSIGNED NOT NULL,
  assistantMessageId INT UNSIGNED NOT NULL,
  sectionRefs JSON NOT NULL DEFAULT ('[]'),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_request_logs_user FOREIGN KEY (userId) REFERENCES users(id),
  CONSTRAINT fk_chat_request_logs_topic FOREIGN KEY (topicId) REFERENCES chat_topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_request_logs_user_msg FOREIGN KEY (userMessageId) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_request_logs_assistant_msg FOREIGN KEY (assistantMessageId) REFERENCES messages(id) ON DELETE CASCADE,
  INDEX idx_chat_request_logs_created (createdAt DESC),
  INDEX idx_chat_request_logs_user (userId),
  INDEX idx_chat_request_logs_topic (topicId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
