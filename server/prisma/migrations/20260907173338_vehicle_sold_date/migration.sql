-- 매도일자 — 손님에게 실제로 넘긴 날.
-- 상담이 판매완료로 찍히면 출고예정이 되고, 넘기고 나서 이 날짜를 적으면 매도로 끝난다.
ALTER TABLE `ManagedVehicle` ADD COLUMN `soldDate` DATE NULL;
CREATE INDEX `ManagedVehicle_soldDate_idx` ON `ManagedVehicle`(`soldDate`);
