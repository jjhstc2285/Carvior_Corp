-- 휠 복원 짝수와 기름 상태.
--
-- 기름은 있다/없다가 아니라 얼마나 있는지를 본다 — 넣고 가야 하는지가 거기서 갈린다.
ALTER TABLE `PurchaseIntake`
  ADD COLUMN `wheelCount` INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN `fuelLevel`  VARCHAR(10) NOT NULL DEFAULT '';
