-- AlterTable
-- 수리비도 주유·배터리·주차와 같은 이력 테이블에서 다룬다(비고는 주유에만 쓰는 건 그대로).
ALTER TABLE `VehicleExpenseLog` MODIFY `kind` ENUM('FUEL', 'BATTERY', 'PARKING', 'REPAIR') NOT NULL;
