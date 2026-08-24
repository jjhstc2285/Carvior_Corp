-- AlterTable
-- 주차비를 주유·배터리와 같은 이력 테이블에서 다룬다(비고는 주유에만 쓰는 건 그대로).
ALTER TABLE `VehicleExpenseLog` MODIFY `kind` ENUM('FUEL', 'BATTERY', 'PARKING') NOT NULL;
