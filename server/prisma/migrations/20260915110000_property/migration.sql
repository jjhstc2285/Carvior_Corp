-- 부동산 — 사무실·주차장·창고로 쓰는 자리. 대표만 본다.
CREATE TABLE `Property` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `usage` VARCHAR(20) NOT NULL DEFAULT '',
  `address` VARCHAR(191) NOT NULL DEFAULT '',
  `ownerName` VARCHAR(30) NOT NULL DEFAULT '',
  `ownerPhone` VARCHAR(30) NOT NULL DEFAULT '',
  `deposit` INTEGER NOT NULL DEFAULT 0,
  `monthlyRent` INTEGER NOT NULL DEFAULT 0,
  `payDay` INTEGER NOT NULL DEFAULT 0,
  `startOn` DATE NULL,
  `endOn` DATE NULL,
  `memo` TEXT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Property_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
