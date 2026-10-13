-- 장기 재고 경고 — 들어온 지 오래된 차를 단계(30·45·60일)마다 한 번씩 알린다.
-- 보낸 기록을 남기는 이유는 둘이다. 같은 차를 매일 다시 알리지 않으려는 것과,
-- 알린 뒤에 무엇을 했는지(값을 내렸는지, 도매로 넘겼는지) 적어 두려는 것.
CREATE TABLE `StockAgeAlert` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `vehicleName` VARCHAR(120) NOT NULL DEFAULT '',
    `intakeDate` DATE NOT NULL,
    `stage` INTEGER NOT NULL,
    `days` INTEGER NOT NULL DEFAULT 0,
    `notifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` VARCHAR(20) NOT NULL DEFAULT '',
    `actionNote` VARCHAR(255) NOT NULL DEFAULT '',
    `actionBy` VARCHAR(30) NOT NULL DEFAULT '',
    `actionAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockAgeAlert_vehicleNumber_idx`(`vehicleNumber`),
    UNIQUE INDEX `StockAgeAlert_vehicleNumber_intakeDate_stage_key`(`vehicleNumber`, `intakeDate`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
