-- AlterTable
-- 지각·조퇴 소명. 승인되면 그날을 정상 출근으로 본다.
-- 연차·외근과 같은 신청 흐름을 쓰므로 종류만 하나 늘린다.
ALTER TABLE `AttendanceRequest`
    MODIFY `kind` ENUM('ANNUAL_LEAVE', 'FIELD_WORK', 'LATE_EXCUSE') NOT NULL;
