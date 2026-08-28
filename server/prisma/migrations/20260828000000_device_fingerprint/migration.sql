-- AlterTable
-- 브라우저 사용기록을 지우면 단말 키가 날아가 매번 다시 등록해야 했다.
-- 그 PC를 알아볼 지문을 남겨두고, 사무실 IP 안에서만 키를 다시 내준다.
ALTER TABLE `AttendanceDevice` ADD COLUMN `fingerprint` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `AttendanceDevice_fingerprint_key` ON `AttendanceDevice`(`fingerprint`);
