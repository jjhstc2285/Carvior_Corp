-- 광고 운영 현황 메모.
-- 대행사 주차별 보고는 여러 줄짜리라 광고비 표의 한 줄 메모 칸에 안 들어간다.
CREATE TABLE `AdReport` (
  `id`        VARCHAR(191) NOT NULL,
  `month`     VARCHAR(7)   NOT NULL,
  `channel`   VARCHAR(30)  NOT NULL,
  `title`     VARCHAR(60)  NOT NULL DEFAULT '',
  `body`      TEXT         NOT NULL,
  `author`    VARCHAR(30)  NOT NULL DEFAULT '',
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,

  INDEX `AdReport_month_channel_idx`(`month`, `channel`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
