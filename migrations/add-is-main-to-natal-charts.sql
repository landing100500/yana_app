-- Добавляем флаг основной натальной карты (создаётся при первом заходе в чат)
ALTER TABLE natal_charts ADD COLUMN isMain TINYINT(1) NOT NULL DEFAULT 0;
