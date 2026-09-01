-- AlterTable
-- 5층 대장에 박스 버리기·책상 정리를 더한다.
-- (쓰레기통 누르기·종이컵 정리는 기존 칸의 이름만 바뀐 것이라 컬럼을 늘리지 않는다)
ALTER TABLE `CleaningLog`
    ADD COLUMN `boxDisposal` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `deskTidy` BOOLEAN NOT NULL DEFAULT false;
