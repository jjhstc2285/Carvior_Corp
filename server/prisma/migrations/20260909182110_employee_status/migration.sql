-- 지금 상태 — "🚗 외근 중", "🍜 점심" 처럼 본인이 적는다.
-- 근태 신청과 달리 승인도 이력도 없이 지금 값만 들고 있는다.
ALTER TABLE `Employee`
  ADD COLUMN `statusEmoji` VARCHAR(8) NULL,
  ADD COLUMN `statusText` VARCHAR(40) NULL,
  ADD COLUMN `statusAt` DATETIME(3) NULL;
