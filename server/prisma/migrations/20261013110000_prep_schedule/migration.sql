-- 상품화 일정 — 차가 들어와서 광고에 올라가기까지. 목표는 나흘이다.
-- 날짜를 적는 이유는 '며칠 걸렸나'를 세기 위해서다. 체크만 해 두면 끝났다는 것만 알고
-- 어디서 늦어졌는지는 모른다 — 늦는 자리는 늘 같은 자리다.
CREATE TABLE `PrepSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `vehicleName` VARCHAR(120) NOT NULL DEFAULT '',
    `intakeDate` DATE NOT NULL,
    `inspectedOn` DATE NULL,
    `outsourcedOn` DATE NULL,
    `photographedOn` DATE NULL,
    `listedOn` DATE NULL,
    `memo` VARCHAR(255) NOT NULL DEFAULT '',
    `lateNotifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrepSchedule_vehicleNumber_key`(`vehicleNumber`),
    INDEX `PrepSchedule_intakeDate_idx`(`intakeDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
