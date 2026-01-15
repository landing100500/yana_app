-- Проверка установленных расширений PostgreSQL
-- Выполните этот запрос в SQL Editor Supabase

-- 1. Проверка всех установленных расширений
SELECT * FROM pg_extension;

-- 2. Проверка конкретно расширения vector
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 3. Если расширение установлено, вы увидите строку с extname = 'vector'
-- Если результат пустой - расширение не установлено

-- 4. Проверка доступности типа vector
SELECT typname FROM pg_type WHERE typname = 'vector';

-- Если тип vector доступен, вы увидите строку с typname = 'vector'
-- Если результат пустой - расширение не установлено или не активировано
