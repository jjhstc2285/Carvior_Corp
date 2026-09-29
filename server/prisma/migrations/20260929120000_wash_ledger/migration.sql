-- 외부주차장 세차 대장. 세차하러 오신 날과 달마다 치른 값.
CREATE TABLE `WashVisit` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `lot` VARCHAR(40) NOT NULL,
    `carCount` INTEGER NOT NULL DEFAULT 0,
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WashVisit_date_lot_key`(`date`, `lot`),
    INDEX `WashVisit_date_idx`(`date`),
    INDEX `WashVisit_recordedById_idx`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WashVisit` ADD CONSTRAINT `WashVisit_recordedById_fkey`
    FOREIGN KEY (`recordedById`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `WashSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `carCount` INTEGER NOT NULL DEFAULT 0,
    `unitPrice` INTEGER NOT NULL DEFAULT 10000,
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `paidOn` DATE NULL,
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WashSettlement_month_key`(`month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
