-- Обновление таблицы для поддержки множественных карт
-- Убираем unique constraint и добавляем поля для названия

-- Удаляем unique constraint на userId (если существует)
SET @exist := (SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
  AND table_name = 'natal_charts' 
  AND constraint_name = 'natal_charts_ibfk_1');
SET @sqlstmt := IF(@exist > 0, 
  'ALTER TABLE natal_charts DROP FOREIGN KEY natal_charts_ibfk_1', 
  'SELECT ''No foreign key to drop''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Удаляем unique индекс на userId
DROP INDEX userId ON natal_charts;

-- Добавляем поле name если его нет
SET @exist := (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
  AND table_name = 'natal_charts' 
  AND column_name = 'name');
SET @sqlstmt := IF(@exist = 0, 
  'ALTER TABLE natal_charts ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT ''Карта''', 
  'SELECT ''Column name already exists''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Переименовываем колонки
ALTER TABLE natal_charts 
  CHANGE COLUMN birthDate chartDate VARCHAR(50) NOT NULL,
  CHANGE COLUMN birthTime chartTime VARCHAR(50) NOT NULL,
  CHANGE COLUMN birthCity chartCity VARCHAR(255) NOT NULL,
  CHANGE COLUMN birthLatitude chartLatitude DECIMAL(10, 7) NOT NULL,
  CHANGE COLUMN birthLongitude chartLongitude DECIMAL(10, 7) NOT NULL;

-- Восстанавливаем foreign key
ALTER TABLE natal_charts 
  ADD CONSTRAINT natal_charts_userId_fk 
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

-- Добавляем индекс для быстрого поиска карт пользователя
-- Используем проверку через информацию о схеме
SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
  AND table_name = 'natal_charts' 
  AND index_name = 'idx_userId');
SET @sqlstmt := IF(@exist = 0, 'CREATE INDEX idx_userId ON natal_charts(userId)', 'SELECT ''Index idx_userId already exists''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
  AND table_name = 'natal_charts' 
  AND index_name = 'idx_userId_createdAt');
SET @sqlstmt := IF(@exist = 0, 'CREATE INDEX idx_userId_createdAt ON natal_charts(userId, createdAt)', 'SELECT ''Index idx_userId_createdAt already exists''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
