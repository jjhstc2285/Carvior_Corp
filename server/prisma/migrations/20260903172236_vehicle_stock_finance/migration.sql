-- 재고금융(제시) — 제시일자·이전일자, 재고금액·할부사·상환일자.
-- 제시 가능 여부는 저장하지 않는다. 연식·주행거리로 그때그때 가린다.
ALTER TABLE `ManagedVehicle`
  ADD COLUMN `modelYear` VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN `mileage` INT NOT NULL DEFAULT 0,
  ADD COLUMN `offerDate` DATE NULL,
  ADD COLUMN `transferDate` DATE NULL,
  ADD COLUMN `stockCapital` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `stockAmount` INT NOT NULL DEFAULT 0,
  ADD COLUMN `repayDate` DATE NULL;

CREATE INDEX `ManagedVehicle_offerDate_idx` ON `ManagedVehicle`(`offerDate`);
CREATE INDEX `ManagedVehicle_repayDate_idx` ON `ManagedVehicle`(`repayDate`);
