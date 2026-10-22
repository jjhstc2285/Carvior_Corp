-- 주차장 구조를 표로 옮긴다.
--
-- 코드에 박아 두었다. 줄 하나를 늘리거나 이름을 고치려면 개발자가 고쳐 올려야 했는데,
-- 실제로 줄을 긋고 차를 대는 건 차량관리팀이다 — 그 팀이 화면에서 고치게 한다.
--
-- 번지(lot)는 저장된 값이다. 세워 둔 차와 세차 기록이 전부 이 값으로 묶여 있어서
-- 바꾸면 지난 기록이 엉뚱한 주차장을 가리킨다 — 부르는 이름(label)만 따로 둔다.
CREATE TABLE `ParkingLotLayout` (
  `lot`       VARCHAR(60) NOT NULL,
  `label`     VARCHAR(60) NOT NULL DEFAULT '',
  `area`      VARCHAR(10) NOT NULL DEFAULT '외부',
  `bandColor` VARCHAR(20) NOT NULL DEFAULT '#e2e8f0',
  `zones`     TEXT        NOT NULL,
  `slots`     TEXT        NOT NULL,
  `sortOrder` INT         NOT NULL DEFAULT 0,
  `active`    BOOLEAN     NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`lot`),
  INDEX `ParkingLotLayout_area_sortOrder_idx` (`area`, `sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
