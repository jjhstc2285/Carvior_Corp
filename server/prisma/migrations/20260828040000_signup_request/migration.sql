-- CreateTable
-- 회원가입 신청. 승인될 때 Employee 를 만든다 — 대기 중 신청이 직원 명단에 섞이지 않게.
CREATE TABLE `SignupRequest` (
    `id` VARCHAR(191) NOT NULL,
    `loginId` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `position` VARCHAR(30) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NOT NULL DEFAULT '',
    `fingerprint` VARCHAR(64) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SignupRequest_loginId_key`(`loginId`),
    INDEX `SignupRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
