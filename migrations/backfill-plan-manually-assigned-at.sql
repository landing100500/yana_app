-- Одноразово: проставить метку ручной выдачи тем, кого выдали до появления planManuallyAssignedAt.
-- Критерий: платный тариф, planAssignedAt есть, рядом (±48 ч) нет успешной оплаты того же тарифа.
-- npm run backfill-plan-manual-assigned

UPDATE users u
SET u.planManuallyAssignedAt = u.planAssignedAt
WHERE u.planCode IN ('hours24', 'optimal', 'professional')
  AND u.planAssignedAt IS NOT NULL
  AND u.planManuallyAssignedAt IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM payments p
    WHERE p.userId = u.id
      AND p.status = 'succeeded'
      AND p.planCode = u.planCode
      AND p.paidAt IS NOT NULL
      AND ABS(TIMESTAMPDIFF(SECOND, p.paidAt, u.planAssignedAt)) <= 172800
  );
