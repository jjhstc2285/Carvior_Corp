-- 알선 정산에도 결재를 붙인다. 매입 정산과 같은 흐름이다.
ALTER TABLE `BrokerageSettlement`
  ADD COLUMN `contractPhotos` TEXT NOT NULL,
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `chiefApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `chiefApprover` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `ceoApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `ceoApprover` VARCHAR(30) NOT NULL DEFAULT '';
