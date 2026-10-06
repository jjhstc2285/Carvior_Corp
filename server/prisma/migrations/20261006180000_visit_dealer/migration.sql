-- 그날 손님을 맞을 담당 딜러. 전화를 받아 적은 사람(employeeId)과 다를 수 있어 따로 둔다.
ALTER TABLE `Consultation` ADD COLUMN `visitDealerId` VARCHAR(191) NULL;
