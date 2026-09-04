-- 신차영업소 상조회비 납부현황. 엑셀 대장을 그대로 옮긴다.
CREATE TABLE `DealerFeeAccount` (
  `id` VARCHAR(191) NOT NULL,
  `dealerName` VARCHAR(60) NOT NULL,
  `managerName` VARCHAR(30) NOT NULL DEFAULT '',
  `managerPhone` VARCHAR(20) NOT NULL DEFAULT '',
  `startedOn` DATE NULL,
  `bank` VARCHAR(30) NOT NULL DEFAULT '',
  `accountHolder` VARCHAR(30) NOT NULL DEFAULT '',
  `accountNumber` VARCHAR(40) NOT NULL DEFAULT '',
  `transferDay` VARCHAR(30) NOT NULL DEFAULT '',
  `monthlyFee` INT NOT NULL DEFAULT 0,
  `feeNote` VARCHAR(60) NOT NULL DEFAULT '',
  `method` ENUM('AUTO', 'DIRECT', 'CANCELED') NOT NULL DEFAULT 'AUTO',
  `autoTransferUntil` VARCHAR(30) NOT NULL DEFAULT '',
  `note` VARCHAR(255) NOT NULL DEFAULT '',
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `DealerFeeAccount_dealerName_idx`(`dealerName`),
  INDEX `DealerFeeAccount_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 이체 조건이 바뀌면 사무장·대표에게 알린다.
ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM('MISSING', 'CORRECTION_REQUEST', 'ATTENDANCE_REQUEST', 'MILEAGE_GAP', 'DEALER_FEE') NOT NULL;
