-- 상품화 차량 사진. 여섯 방향을 한 묶음으로 둔다.
CREATE TABLE `VehiclePhotoSet` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `vehicleName` VARCHAR(60) NOT NULL DEFAULT '',
    `shotOn` DATE NOT NULL,
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VehiclePhotoSet_vehicleNumber_shotOn_key`(`vehicleNumber`, `shotOn`),
    INDEX `VehiclePhotoSet_shotOn_idx`(`shotOn`),
    INDEX `VehiclePhotoSet_recordedById_idx`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VehiclePhoto` (
    `id` VARCHAR(191) NOT NULL,
    `setId` VARCHAR(191) NOT NULL,
    `slot` ENUM('FRONT', 'REAR', 'LEFT', 'RIGHT', 'DASH', 'INTERIOR') NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VehiclePhoto_setId_slot_key`(`setId`, `slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VehiclePhotoSet` ADD CONSTRAINT `VehiclePhotoSet_recordedById_fkey`
    FOREIGN KEY (`recordedById`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VehiclePhoto` ADD CONSTRAINT `VehiclePhoto_setId_fkey`
    FOREIGN KEY (`setId`) REFERENCES `VehiclePhotoSet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
