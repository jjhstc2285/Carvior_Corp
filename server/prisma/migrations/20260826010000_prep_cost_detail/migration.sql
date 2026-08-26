-- CreateTable
-- 상품화 비용을 항목 6종 × 업체/카테고리 명세로 쪼갠다.
CREATE TABLE `PurchasePrepCost` (
    `id` VARCHAR(191) NOT NULL,
    `settlementId` VARCHAR(191) NOT NULL,
    `kind` ENUM('POLISH_WASH', 'DENT', 'PERFORMANCE', 'DELIVERY', 'REPAIR', 'DIAGNOSIS') NOT NULL,
    `vendor` VARCHAR(60) NOT NULL DEFAULT '',
    `amount` INTEGER NOT NULL DEFAULT 0,
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchasePrepCost_settlementId_idx`(`settlementId`),
    INDEX `PurchasePrepCost_kind_vendor_idx`(`kind`, `vendor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchasePrepCost` ADD CONSTRAINT `PurchasePrepCost_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `PurchaseSettlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 정산 건의 항목별 금액을 명세 한 줄씩으로 옮긴다.
-- 0원인 항목은 만들지 않는다 — 안 쓴 항목까지 빈 줄로 남으면 화면이 지저분해진다.
-- 업체명은 그때 안 적었으므로 비워둔다(화면에는 '미지정'으로 보인다).
INSERT INTO `PurchasePrepCost` (`id`, `settlementId`, `kind`, `vendor`, `amount`, `memo`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT UUID(), s.`id`, k.`kind`, '', k.`amount`, '', k.`sortOrder`, NOW(3), NOW(3)
FROM `PurchaseSettlement` s
JOIN (
    SELECT `id` AS sid, 'POLISH_WASH' AS `kind`, `polishWashCost`  AS `amount`, 0 AS `sortOrder` FROM `PurchaseSettlement`
    UNION ALL SELECT `id`, 'DENT',        `dentCost`,        1 FROM `PurchaseSettlement`
    UNION ALL SELECT `id`, 'PERFORMANCE', `performanceCost`, 2 FROM `PurchaseSettlement`
    UNION ALL SELECT `id`, 'DELIVERY',    `deliveryCost`,    3 FROM `PurchaseSettlement`
    UNION ALL SELECT `id`, 'REPAIR',      `repairCost`,      4 FROM `PurchaseSettlement`
    UNION ALL SELECT `id`, 'DIAGNOSIS',   `diagnosisCost`,   5 FROM `PurchaseSettlement`
) k ON k.sid = s.`id`
WHERE k.`amount` <> 0;
