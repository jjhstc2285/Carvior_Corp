-- 판금집 청구서 총액. 차에 나눠 붙이지 않고 받은 총액을 그대로 적어 둔다 —
-- 판금·덴트 합계는 이 값으로 덮어쓴다.
CREATE TABLE `PanelInvoiceTotal` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `vendor` VARCHAR(20) NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `writer` VARCHAR(30) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PanelInvoiceTotal_month_idx`(`month`),
    UNIQUE INDEX `PanelInvoiceTotal_month_vendor_key`(`month`, `vendor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
