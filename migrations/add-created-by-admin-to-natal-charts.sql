-- Карты, созданные в админке (Рассчитать карту) vs при входе пользователя в сервис
--
-- ВАЖНО: выполнять в основной БД приложения (MySQL), НЕ в Supabase.
-- Таблица natal_charts создаётся Sequelize в той же БД, что и users, messages и т.д.
--
ALTER TABLE natal_charts ADD COLUMN createdByAdmin TINYINT(1) NOT NULL DEFAULT 0;
