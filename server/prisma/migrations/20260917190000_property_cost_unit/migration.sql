-- 대당 단가와 대수. 주차 임대료는 대수가 오르내려서(50대 들어올 수도, 100대 들어올 수도)
-- 금액만 적어두면 매달 다시 계산하게 된다. 단가와 대수를 두면 대수만 고치면 된다.
ALTER TABLE `PropertyCost`
  ADD COLUMN `unitPrice` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `units` INTEGER NOT NULL DEFAULT 0;
