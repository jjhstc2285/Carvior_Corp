-- 구전 지급 방식(현금/3.3%/13.3%)과 실차 확인 주행거리.
-- 기존 매입 건은 현금·미확인으로 들어간다.
ALTER TABLE `PurchaseIntake`
  ADD COLUMN `checkedMileage` INT NOT NULL DEFAULT 0,
  ADD COLUMN `brokerFeeType` ENUM('CASH', 'WITHHOLD_3_3', 'WITHHOLD_13_3') NOT NULL DEFAULT 'CASH';

-- 주행거리가 크게 벌어졌을 때 쓰는 알림 종류.
ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM('MISSING', 'CORRECTION_REQUEST', 'ATTENDANCE_REQUEST', 'MILEAGE_GAP') NOT NULL;
