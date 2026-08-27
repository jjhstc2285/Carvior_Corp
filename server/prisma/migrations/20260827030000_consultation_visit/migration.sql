-- AlterTable
-- 손님 방문 예정. 카톡 양식에 "오후 3시~4시 방문"처럼 적혀 오는데 받을 칸이 없었다.
-- 시각은 범위나 두루뭉술한 표현이 많아 적힌 그대로 문자열로 둔다.
ALTER TABLE `Consultation`
    ADD COLUMN `visitDate` DATE NULL,
    ADD COLUMN `visitTime` VARCHAR(30) NOT NULL DEFAULT '';

-- CreateIndex — 달력에서 그날 방문 예정을 모아 보기 위해
CREATE INDEX `Consultation_visitDate_idx` ON `Consultation`(`visitDate`);
