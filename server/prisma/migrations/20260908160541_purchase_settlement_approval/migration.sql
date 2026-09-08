-- 매입 정산 결재. 계약팀이 채워 올리면 본부장이 보고 대표가 마지막에 찍는다.
-- 단계는 저장하지 않고 찍힌 날짜로 낸다.
ALTER TABLE `PurchaseSettlement`
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `chiefApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `chiefApprover` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `ceoApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `ceoApprover` VARCHAR(30) NOT NULL DEFAULT '';
