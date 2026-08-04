-- Лимит бесплатных AI-запросов, штампуется при регистрации / выдаче free.
-- ВАЖНО: основная БД приложения (MySQL), не Supabase.
-- npm run migrate-free-ai-requests-limit

ALTER TABLE users
  ADD COLUMN freeAiRequestsLimit INT UNSIGNED NOT NULL DEFAULT 6
  AFTER freeAiRequestsUsed;
