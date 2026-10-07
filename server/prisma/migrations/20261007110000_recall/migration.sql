-- 리콜 — 안 된 건에 팀장(지금은 대표)이 다시 전화를 걸어 보는 것.
-- 담당자가 적는 리뷰와는 다른 일이라 칸을 따로 둔다.
ALTER TABLE `Consultation`
  ADD COLUMN `recallAt` DATETIME(3) NULL,
  ADD COLUMN `recallBy` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `recallResult` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `recallNote` TEXT NOT NULL;
