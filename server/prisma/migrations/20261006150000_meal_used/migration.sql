-- 구내식당(함바집)에서 먹었는가. 비어 있으면 출퇴근으로 자동 판정하고,
-- 사람이 켜거나 끄면 그 값이 자동 판정을 이긴다.
ALTER TABLE `AttendanceRecord` ADD COLUMN `mealUsed` BOOLEAN NULL;
