-- 등록증상 최초등록일 — 등록증이 손에 있는 매입 때 받아 적고 차량 관리로 넘긴다.
ALTER TABLE `PurchaseIntake`
  ADD COLUMN `firstRegisteredOn` DATE NULL;
