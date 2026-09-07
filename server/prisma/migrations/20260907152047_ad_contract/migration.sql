-- 광고 계약과 그 계약으로 올린 차. 월 약정 대수를 다 못 쓰면 돈이 날아간다.
CREATE TABLE `AdContract` (
  `id` VARCHAR(191) NOT NULL,
  `platform` VARCHAR(30) NOT NULL,
  `productName` VARCHAR(60) NOT NULL DEFAULT '',
  `monthlyFee` INT NOT NULL DEFAULT 0,
  `monthlyQuota` INT NOT NULL DEFAULT 0,
  `months` INT NOT NULL DEFAULT 1,
  `startOn` DATE NOT NULL,
  `endOn` DATE NOT NULL,
  `note` VARCHAR(255) NOT NULL DEFAULT '',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `AdContract_active_endOn_idx`(`active`, `endOn`),
  INDEX `AdContract_platform_idx`(`platform`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdPosting` (
  `id` VARCHAR(191) NOT NULL,
  `contractId` VARCHAR(191) NOT NULL,
  `vehicleNumber` VARCHAR(30) NOT NULL,
  `postedOn` DATE NOT NULL,
  `auto` BOOLEAN NOT NULL DEFAULT false,
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `AdPosting_contractId_vehicleNumber_key`(`contractId`, `vehicleNumber`),
  INDEX `AdPosting_contractId_postedOn_idx`(`contractId`, `postedOn`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AdPosting`
  ADD CONSTRAINT `AdPosting_contractId_fkey`
    FOREIGN KEY (`contractId`) REFERENCES `AdContract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 약정 대수가 남았는데 기간이 얼마 안 남았을 때 쓰는 알림.
ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM('MISSING', 'CORRECTION_REQUEST', 'ATTENDANCE_REQUEST', 'MILEAGE_GAP', 'DEALER_FEE', 'APPROVAL', 'AD_QUOTA') NOT NULL;
