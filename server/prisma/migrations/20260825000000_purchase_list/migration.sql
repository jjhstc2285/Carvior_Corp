-- CreateTable
-- 매입리스트 — 엑셀 시트를 그대로 옮긴 재고금융 장부.
-- 금액은 정산(만원)과 달리 전부 '원' 단위다.
CREATE TABLE `PurchaseListItem` (
    `id` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `date` DATE NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `vehicleName` VARCHAR(60) NOT NULL,
    `managerName` VARCHAR(30) NOT NULL,
    `askingPrice` INTEGER NOT NULL DEFAULT 0,
    `modelYear` VARCHAR(10) NOT NULL,
    `mileage` INTEGER NOT NULL DEFAULT 0,
    `stockCapital` VARCHAR(20) NULL,
    `stockAmount` INTEGER NOT NULL DEFAULT 0,
    `limitBmw` INTEGER NOT NULL DEFAULT 0,
    `limitWoori` INTEGER NOT NULL DEFAULT 0,
    `limitKb` INTEGER NOT NULL DEFAULT 0,
    `limitMeritz` INTEGER NOT NULL DEFAULT 0,
    `limitHana` INTEGER NOT NULL DEFAULT 0,
    `limitHyundai` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(255) NOT NULL DEFAULT '',
    `loanDate` DATE NULL,
    `interestRate` DOUBLE NULL,
    `repayDate` DATE NULL,
    `loanStatus` VARCHAR(30) NOT NULL DEFAULT '',
    `repaidDate` DATE NULL,
    `repaymentAmount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseListItem_repayDate_idx`(`repayDate`),
    INDEX `PurchaseListItem_vehicleNumber_idx`(`vehicleNumber`),
    INDEX `PurchaseListItem_seq_idx`(`seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
