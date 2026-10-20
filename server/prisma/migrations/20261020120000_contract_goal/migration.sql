-- 그 달 계약 목표.
--
-- 브라우저에만 담아 뒀었다 — 대표 혼자 보는 숫자라 서버에 둘 일이 아니라고 봤다.
-- 그런데 팀장이 같이 보게 되면서 각자 다른 숫자를 보게 됐다. 한 사람이 적은 목표를
-- 다른 사람이 못 보면 그건 목표가 아니다.
CREATE TABLE `ContractGoal` (
  `month`     VARCHAR(7)  NOT NULL,
  `target`    INT         NOT NULL DEFAULT 0,
  `updatedBy` VARCHAR(30) NOT NULL DEFAULT '',
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`month`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
