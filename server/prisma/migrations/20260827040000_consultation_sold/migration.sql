-- AlterTable
-- 판매완료 상태와 출고 입금액.
-- 상담 → 계약 → 판매완료 → 정산 순으로 가는데 판매완료 상태가 없어 종결과 섞였다.
ALTER TABLE `Consultation`
    MODIFY `status` ENUM('IN_PROGRESS', 'CONTRACTED', 'SOLD', 'ON_HOLD', 'CLOSED') NOT NULL DEFAULT 'IN_PROGRESS',
    ADD COLUMN `depositAmount` INTEGER NOT NULL DEFAULT 0;
