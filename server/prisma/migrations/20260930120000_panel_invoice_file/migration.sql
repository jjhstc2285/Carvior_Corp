-- 판금집 청구서 원본 파일(엑셀·사진). 달·업체로 묶어 두고 나중에 원본을 다시 본다.
CREATE TABLE `PanelInvoiceFile` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `vendor` VARCHAR(20) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `name` VARCHAR(120) NOT NULL DEFAULT '',
    `mime` VARCHAR(80) NOT NULL DEFAULT '',
    `size` INTEGER NOT NULL DEFAULT 0,
    `writer` VARCHAR(30) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PanelInvoiceFile_month_idx`(`month`),
    INDEX `PanelInvoiceFile_month_vendor_idx`(`month`, `vendor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
