-- Метка: тариф выдан вручную из админки (не сбрасывается при оплате через ЮKassa).
-- ВАЖНО: основная БД приложения (MySQL), не Supabase.
-- npm run migrate-plan-manual-assigned

ALTER TABLE users
  ADD COLUMN planManuallyAssignedAt DATETIME NULL DEFAULT NULL
  AFTER planExpiresAt;
