-- 결재 문서. 지금은 시말서 하나지만 양식이 늘어도 종류로 가른다.
CREATE TABLE `ApprovalDocument` (
  `id` VARCHAR(191) NOT NULL,
  `kind` ENUM('INCIDENT_REPORT') NOT NULL DEFAULT 'INCIDENT_REPORT',
  `employeeId` VARCHAR(191) NOT NULL,
  `department` VARCHAR(30) NOT NULL DEFAULT '',
  `position` VARCHAR(30) NOT NULL DEFAULT '',
  `name` VARCHAR(30) NOT NULL,
  `content` TEXT NOT NULL,
  `writtenOn` DATE NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewerId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ApprovalDocument_employeeId_idx`(`employeeId`),
  INDEX `ApprovalDocument_status_idx`(`status`),
  INDEX `ApprovalDocument_writtenOn_idx`(`writtenOn`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApprovalDocument`
  ADD CONSTRAINT `ApprovalDocument_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ApprovalDocument_reviewerId_fkey`
    FOREIGN KEY (`reviewerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 결재 문서가 올라오거나 처리됐을 때 쓰는 알림 종류.
ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM('MISSING', 'CORRECTION_REQUEST', 'ATTENDANCE_REQUEST', 'MILEAGE_GAP', 'DEALER_FEE', 'APPROVAL') NOT NULL;
