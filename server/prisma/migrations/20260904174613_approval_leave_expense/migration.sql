-- 휴가원·지출결의서. 양식마다 칸이 달라 비어 있을 수 있다.
-- JSON 한 칸에 몰지 않는 이유는 "이번 달 휴가 며칠 / 지출 얼마"를 물어보려면 칸이어야 해서다.
ALTER TABLE `ApprovalDocument`
  MODIFY COLUMN `kind` ENUM('INCIDENT_REPORT', 'LEAVE', 'EXPENSE') NOT NULL DEFAULT 'INCIDENT_REPORT',
  ADD COLUMN `leaveKind` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `startOn` DATE NULL,
  ADD COLUMN `endOn` DATE NULL,
  ADD COLUMN `days` DOUBLE NULL,
  ADD COLUMN `spentOn` DATE NULL,
  ADD COLUMN `amount` INT NOT NULL DEFAULT 0,
  ADD COLUMN `payee` VARCHAR(60) NOT NULL DEFAULT '';
