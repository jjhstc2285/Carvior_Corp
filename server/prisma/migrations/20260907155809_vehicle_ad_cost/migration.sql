-- 차 한 대에 쓴 광고비(원). 광고 관리에서 제시함·재고 잡힌 차를 골라 적는다.
ALTER TABLE `ManagedVehicle` ADD COLUMN `adCost` INTEGER NOT NULL DEFAULT 0;
