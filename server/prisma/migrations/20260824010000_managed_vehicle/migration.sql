-- CreateTable
CREATE TABLE `ManagedVehicle` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `plateTail` VARCHAR(191) NOT NULL,
    `vehicleModel` VARCHAR(191) NOT NULL,
    `prepared` BOOLEAN NOT NULL DEFAULT false,
    `advertised` BOOLEAN NOT NULL DEFAULT false,
    `moveBlocked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ManagedVehicle_vehicleNumber_key`(`vehicleNumber`),
    INDEX `ManagedVehicle_plateTail_idx`(`plateTail`),
    INDEX `ManagedVehicle_vehicleModel_idx`(`vehicleModel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleExpenseLog` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `kind` ENUM('FUEL', 'BATTERY') NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `date` DATE NOT NULL,
    `note` ENUM('IN_PREP', 'TEST_DRIVE', 'SOLD') NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VehicleExpenseLog_vehicleId_date_idx`(`vehicleId`, `date`),
    INDEX `VehicleExpenseLog_kind_date_idx`(`kind`, `date`),
    INDEX `VehicleExpenseLog_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VehicleExpenseLog` ADD CONSTRAINT `VehicleExpenseLog_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `ManagedVehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehicleExpenseLog` ADD CONSTRAINT `VehicleExpenseLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
