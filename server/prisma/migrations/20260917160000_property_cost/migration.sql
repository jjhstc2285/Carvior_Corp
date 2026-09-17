-- 자리마다 달마다 나가는 돈 — 월세 · 관리비 · 주차 임대료 같은 것.
-- 고지서가 여러 장으로 흩어져 있어 '한 달에 얼마가 고정으로 나가는지'를 셀 수가 없었다.
CREATE TABLE `PropertyCost` (
  `id` VARCHAR(191) NOT NULL,
  `propertyId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(20) NOT NULL DEFAULT '관리비',
  `amount` INTEGER NOT NULL DEFAULT 0,
  `payDay` INTEGER NOT NULL DEFAULT 0,
  `method` VARCHAR(10) NOT NULL DEFAULT '직접이체',
  `payee` VARCHAR(60) NOT NULL DEFAULT '',
  `account` VARCHAR(60) NOT NULL DEFAULT '',
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `PropertyCost_propertyId_idx`(`propertyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
