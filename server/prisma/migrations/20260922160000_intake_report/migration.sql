-- 검차 리포트 주소. 카비어가 계약에 달아 주는 성능점검 결과다.
ALTER TABLE `PurchaseIntake` ADD COLUMN `reportUrl` VARCHAR(500) NOT NULL DEFAULT '';
