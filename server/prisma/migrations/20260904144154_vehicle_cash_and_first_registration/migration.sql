-- 등록증상 최초등록일 — 10년차 경계를 월까지 봐야 갈릴 때만 채운다.
-- 현금차량 — 재고금융이 안 되는 차. 제시 대상에서 뺀다.
ALTER TABLE `ManagedVehicle`
  ADD COLUMN `firstRegisteredOn` DATE NULL,
  ADD COLUMN `cashVehicle` BOOLEAN NOT NULL DEFAULT false;
