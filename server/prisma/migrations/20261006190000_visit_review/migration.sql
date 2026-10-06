-- 왜 계약이 안 됐는가 — 손님이 다녀간 뒤 담당이 적는다. 전환율 숫자 뒤의 이유를 남긴다.
ALTER TABLE `Consultation`
  ADD COLUMN `missReason` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `missReview` TEXT NOT NULL,
  ADD COLUMN `missReviewBy` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `missReviewAt` DATETIME(3) NULL;
