-- 플랫폼 할 일 — 특이차량과, 플랫폼마다 손봐야 하는 차(미등록·판매완료신고).
-- 시트에서는 세 가지가 한 장에 옆으로 붙어 있는데 담는 모양이 같아 한 표로 둔다.
CREATE TABLE `PlatformIssue` (
    `id` VARCHAR(191) NOT NULL,
    `site` VARCHAR(10) NOT NULL DEFAULT '',
    `kind` VARCHAR(20) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `issue` VARCHAR(30) NOT NULL DEFAULT '',
    `note` VARCHAR(60) NOT NULL DEFAULT '',
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlatformIssue_vehicleNumber_idx`(`vehicleNumber`),
    UNIQUE INDEX `PlatformIssue_site_kind_vehicleNumber_key`(`site`, `kind`, `vehicleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 엔카 계정별 등록 현황 — 이 차가 누구 아이디로 올라가 있나.
CREATE TABLE `PlatformAccount` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(30) NOT NULL,
    `encarId` VARCHAR(30) NOT NULL DEFAULT '',
    `status` VARCHAR(30) NOT NULL DEFAULT '',
    `duplicate` VARCHAR(30) NOT NULL DEFAULT '',
    `syncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlatformAccount_vehicleNumber_key`(`vehicleNumber`),
    INDEX `PlatformAccount_encarId_idx`(`encarId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
