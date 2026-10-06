-- 매입 정산에 붙는 식대 — 달마다 한 사람에 한 줄. 차 한 대에 붙는 값이 아니라
-- 달마다 한 번 적는 값이라 정산 줄에 넣지 않고 따로 둔다.
CREATE TABLE `SettlementMeal` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `writer` VARCHAR(30) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SettlementMeal_month_idx`(`month`),
    UNIQUE INDEX `SettlementMeal_month_employeeId_key`(`month`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
