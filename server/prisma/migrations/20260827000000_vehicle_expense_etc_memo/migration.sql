-- AlterTable
-- 기타 항목 추가 + 무엇에 쓴 돈인지 적는 메모.
-- 같은 '수리비'라도 타이어인지 썬팅인지가 나중에 정산에서 갈린다.
ALTER TABLE `VehicleExpenseLog`
    MODIFY `kind` ENUM('FUEL', 'BATTERY', 'PARKING', 'REPAIR', 'ETC') NOT NULL,
    ADD COLUMN `memo` VARCHAR(191) NOT NULL DEFAULT '';
