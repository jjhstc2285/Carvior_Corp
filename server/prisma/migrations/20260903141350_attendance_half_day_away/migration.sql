-- 반차·자리비움 추가. 값을 늘리기만 해서 기존 신청은 그대로다.
ALTER TABLE `AttendanceRequest`
  MODIFY COLUMN `kind` ENUM('ANNUAL_LEAVE', 'HALF_DAY', 'FIELD_WORK', 'AWAY', 'LATE_EXCUSE') NOT NULL;
