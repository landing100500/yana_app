-- Память о пользователе (факты из диалогов) и резюме длинных топиков.
-- Выполнять в основной БД приложения (MySQL).
CREATE TABLE IF NOT EXISTS user_memories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  userId INT UNSIGNED NOT NULL UNIQUE,
  facts TEXT NOT NULL DEFAULT '',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_memories_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_memories_user (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_topic_summaries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topicId INT UNSIGNED NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  upToMessageId INT UNSIGNED NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_topic_summaries_topic FOREIGN KEY (topicId) REFERENCES chat_topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_topic_summaries_message FOREIGN KEY (upToMessageId) REFERENCES messages(id) ON DELETE CASCADE,
  INDEX idx_chat_topic_summaries_topic (topicId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
