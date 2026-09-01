-- CreateTable
-- 청소 관리 대장 — 벽에 붙여두고 손으로 체크하던 것을 옮긴다.
CREATE TABLE `CleaningLog` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `time` VARCHAR(5) NOT NULL,
    `sweep` BOOLEAN NOT NULL DEFAULT false,
    `wipe` BOOLEAN NOT NULL DEFAULT false,
    `waterPurifier` BOOLEAN NOT NULL DEFAULT false,
    `shredder` BOOLEAN NOT NULL DEFAULT false,
    `trashBin` BOOLEAN NOT NULL DEFAULT false,
    `paperCup` BOOLEAN NOT NULL DEFAULT false,
    `broomClean` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CleaningLog_date_idx`(`date`),
    INDEX `CleaningLog_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CleaningLog` ADD CONSTRAINT `CleaningLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
