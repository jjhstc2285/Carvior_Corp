-- AlterTable
-- 층마다 체크 항목이 달라 층 구분을 둔다. 기존 기록은 5층 대장이었다.
-- 물걸레는 1층에만 있는 항목이라 칸을 하나 늘린다.
ALTER TABLE `CleaningLog`
    ADD COLUMN `floor` VARCHAR(10) NOT NULL DEFAULT '5F',
    ADD COLUMN `wetMop` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex — 층별로 그 달 기록을 뽑는다
CREATE INDEX `CleaningLog_floor_date_idx` ON `CleaningLog`(`floor`, `date`);

-- DropIndex
DROP INDEX `CleaningLog_date_idx` ON `CleaningLog`;
