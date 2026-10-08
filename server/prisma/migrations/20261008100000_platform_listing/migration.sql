-- 플랫폼별 매물 — 우리 값과 엔카·차차차에 올라간 값이 같은가.
-- 금액은 만원이고, 0은 '안 올라가 있음'이다(0원짜리 차는 없다).
CREATE TABLE `PlatformListing` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `vehicleName` VARCHAR(120) NOT NULL DEFAULT '',
    `salePrice` INTEGER NOT NULL DEFAULT 0,
    `saleNote` VARCHAR(20) NOT NULL DEFAULT '',
    `encar` INTEGER NOT NULL DEFAULT 0,
    `chacha` INTEGER NOT NULL DEFAULT 0,
    `memo` VARCHAR(255) NOT NULL DEFAULT '',
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformListing_vehicleNumber_key`(`vehicleNumber`),
    INDEX `PlatformListing_vehicleNumber_idx`(`vehicleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
