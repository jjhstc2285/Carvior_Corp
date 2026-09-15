-- 월별 광고비. 엔카·차차차처럼 대수로 파는 약정 말고, 구글 애즈·114·알바천국처럼
-- 달마다 얼마를 썼는지만 남기는 광고를 적는다.
CREATE TABLE `AdSpend` (
  `id` VARCHAR(191) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `channel` VARCHAR(30) NOT NULL,
  `amount` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(10) NOT NULL DEFAULT '',
  `owner` VARCHAR(30) NOT NULL DEFAULT '',
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `AdSpend_month_idx`(`month`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
