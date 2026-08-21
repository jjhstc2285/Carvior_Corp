-- CreateTable
CREATE TABLE `Employee` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `provider` ENUM('KAKAO', 'NAVER', 'LOCAL') NULL,
    `providerId` VARCHAR(191) NULL,
    `loginId` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_loginId_key`(`loginId`),
    INDEX `Employee_name_idx`(`name`),
    UNIQUE INDEX `Employee_provider_providerId_key`(`provider`, `providerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeePhone` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `EmployeePhone_employeeId_sortOrder_idx`(`employeeId`, `sortOrder`),
    INDEX `EmployeePhone_number_idx`(`number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `clockIn` VARCHAR(191) NULL,
    `clockOut` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceRecord_date_idx`(`date`),
    UNIQUE INDEX `AttendanceRecord_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CorrectionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `reason` TEXT NOT NULL,
    `requestedClockIn` VARCHAR(191) NULL,
    `requestedClockOut` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CorrectionRequest_employeeId_idx`(`employeeId`),
    INDEX `CorrectionRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceRequest` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `kind` ENUM('ANNUAL_LEAVE', 'FIELD_WORK') NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttendanceRequest_employeeId_idx`(`employeeId`),
    INDEX `AttendanceRequest_status_idx`(`status`),
    INDEX `AttendanceRequest_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('MISSING', 'CORRECTION_REQUEST', 'ATTENDANCE_REQUEST') NOT NULL,
    `message` TEXT NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_employeeId_idx`(`employeeId`),
    INDEX `Notification_read_idx`(`read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IpWhitelist` (
    `ip` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`ip`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Consultation` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'CONTRACTED', 'ON_HOLD', 'CLOSED') NOT NULL DEFAULT 'IN_PROGRESS',
    `date` DATE NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `nextContactDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Consultation_employeeId_idx`(`employeeId`),
    INDEX `Consultation_vehicleNumber_idx`(`vehicleNumber`),
    INDEX `Consultation_customerName_idx`(`customerName`),
    INDEX `Consultation_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsultationFile` (
    `id` VARCHAR(191) NOT NULL,
    `consultationId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConsultationFile_consultationId_idx`(`consultationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Settlement` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `vehicleInfo` VARCHAR(191) NOT NULL,
    `purchaseCost` INTEGER NOT NULL DEFAULT 0,
    `prepCost` INTEGER NOT NULL DEFAULT 0,
    `saleAmount` INTEGER NOT NULL DEFAULT 0,
    `feeAmount` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `date` DATE NOT NULL,
    `memo` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Settlement_employeeId_idx`(`employeeId`),
    INDEX `Settlement_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrokerageSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `vehicleName` VARCHAR(191) NOT NULL,
    `totalSaleAmount` INTEGER NOT NULL DEFAULT 0,
    `ownerDeposit` INTEGER NOT NULL DEFAULT 0,
    `transferFee` INTEGER NOT NULL DEFAULT 0,
    `transferFeeBalance` INTEGER NOT NULL DEFAULT 0,
    `cashCommission` INTEGER NOT NULL DEFAULT 0,
    `installmentFee` INTEGER NOT NULL DEFAULT 0,
    `insuranceFee` INTEGER NOT NULL DEFAULT 0,
    `etcCost` INTEGER NOT NULL DEFAULT 0,
    `settlementAmount` INTEGER NOT NULL DEFAULT 0,
    `employeeId` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `memo` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BrokerageSettlement_employeeId_idx`(`employeeId`),
    INDEX `BrokerageSettlement_date_idx`(`date`),
    INDEX `BrokerageSettlement_vehicleNumber_idx`(`vehicleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseSettlement` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `vehicleName` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `transferFee` INTEGER NOT NULL DEFAULT 0,
    `purchasePrice` INTEGER NOT NULL DEFAULT 0,
    `polishWashCost` INTEGER NOT NULL DEFAULT 0,
    `dentCost` INTEGER NOT NULL DEFAULT 0,
    `performanceCost` INTEGER NOT NULL DEFAULT 0,
    `deliveryCost` INTEGER NOT NULL DEFAULT 0,
    `repairCost` INTEGER NOT NULL DEFAULT 0,
    `brokerFee` INTEGER NOT NULL DEFAULT 0,
    `diagnosisCost` INTEGER NOT NULL DEFAULT 0,
    `settlementAmount` INTEGER NOT NULL DEFAULT 0,
    `newCarName` VARCHAR(191) NOT NULL DEFAULT '',
    `employeeId` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `memo` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseSettlement_employeeId_idx`(`employeeId`),
    INDEX `PurchaseSettlement_date_idx`(`date`),
    INDEX `PurchaseSettlement_vehicleNumber_idx`(`vehicleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParkingVehicle` (
    `id` VARCHAR(191) NOT NULL,
    `lot` VARCHAR(191) NOT NULL,
    `zone` VARCHAR(191) NOT NULL,
    `slot` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `vehicleModel` VARCHAR(191) NOT NULL,
    `status` ENUM('DISPLAY', 'SOLD', 'RESERVED', 'MOVING') NOT NULL DEFAULT 'DISPLAY',
    `employeeId` VARCHAR(191) NOT NULL,
    `memo` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ParkingVehicle_employeeId_idx`(`employeeId`),
    INDEX `ParkingVehicle_vehicleNumber_idx`(`vehicleNumber`),
    UNIQUE INDEX `ParkingVehicle_lot_zone_slot_key`(`lot`, `zone`, `slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehiclePost` (
    `id` VARCHAR(191) NOT NULL,
    `site` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `vehicleModel` VARCHAR(191) NOT NULL,
    `customerPhone` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VehiclePost_employeeId_idx`(`employeeId`),
    INDEX `VehiclePost_vehicleNumber_idx`(`vehicleNumber`),
    INDEX `VehiclePost_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehiclePostPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VehiclePostPhoto_postId_sortOrder_idx`(`postId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeePhone` ADD CONSTRAINT `EmployeePhone_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CorrectionRequest` ADD CONSTRAINT `CorrectionRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRequest` ADD CONSTRAINT `AttendanceRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Consultation` ADD CONSTRAINT `Consultation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsultationFile` ADD CONSTRAINT `ConsultationFile_consultationId_fkey` FOREIGN KEY (`consultationId`) REFERENCES `Consultation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Settlement` ADD CONSTRAINT `Settlement_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BrokerageSettlement` ADD CONSTRAINT `BrokerageSettlement_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseSettlement` ADD CONSTRAINT `PurchaseSettlement_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingVehicle` ADD CONSTRAINT `ParkingVehicle_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehiclePost` ADD CONSTRAINT `VehiclePost_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VehiclePostPhoto` ADD CONSTRAINT `VehiclePostPhoto_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `VehiclePost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

