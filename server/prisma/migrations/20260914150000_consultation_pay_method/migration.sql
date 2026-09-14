-- 현금으로 팔았는지 할부로 팔았는지. 할부면 어느 캐피탈로 얼마를 깔았는지 같이 적는다.
-- 재고금융을 쓴 캐피탈에 약정만큼 채웠는지 세는 값이다.
-- 지난 상담은 안 적혀 있으므로 UNKNOWN 으로 둔다 — 현금으로 몰면 없는 사실이 생긴다.
ALTER TABLE `Consultation`
  ADD COLUMN `payMethod` ENUM('UNKNOWN', 'CASH', 'INSTALLMENT') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `installmentCapital` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `installmentAmount` INTEGER NOT NULL DEFAULT 0;
