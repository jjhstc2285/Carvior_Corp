-- CreateTable
-- 매입 관리 — 차를 사올 때 받아 적는 인수 내역.
-- 금액은 매입리스트와 같은 '원' 단위다.
CREATE TABLE `PurchaseIntake` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `customerPhone` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(30) NOT NULL,
    `source` VARCHAR(120) NOT NULL DEFAULT '',
    `inspector` VARCHAR(60) NOT NULL DEFAULT '',
    `vehicleName` VARCHAR(150) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `modelYear` VARCHAR(10) NOT NULL DEFAULT '',
    `fuel` VARCHAR(20) NOT NULL DEFAULT '',
    `keyCount` INTEGER NOT NULL DEFAULT 0,
    `mileage` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(255) NOT NULL DEFAULT '',
    `purchaseAmount` INTEGER NOT NULL DEFAULT 0,
    `brokerFee` INTEGER NOT NULL DEFAULT 0,
    `employeeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseIntake_date_idx`(`date`),
    INDEX `PurchaseIntake_vehicleNumber_idx`(`vehicleNumber`),
    INDEX `PurchaseIntake_customerName_idx`(`customerName`),
    INDEX `PurchaseIntake_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchaseIntake` ADD CONSTRAINT `PurchaseIntake_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
