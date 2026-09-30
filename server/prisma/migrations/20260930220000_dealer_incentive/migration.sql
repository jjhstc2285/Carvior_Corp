-- 알선팀 타이틀 — 직책과 다르다. 알선팀 안에서의 등급이라 실적으로 오르내린다.
ALTER TABLE `Employee` ADD COLUMN `referralTitle` VARCHAR(10) NOT NULL DEFAULT '';

-- 딜러 인센티브 — 달마다 한 사람에 한 줄. 계산에 쓰는 값만 담고 결과는 볼 때마다 낸다.
CREATE TABLE `DealerIncentive` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sales` INTEGER NOT NULL DEFAULT 0,
    `years` INTEGER NOT NULL DEFAULT 0,
    `baseSalary` INTEGER NOT NULL DEFAULT 0,
    `targetAchieved` BOOLEAN NOT NULL DEFAULT false,
    `memo` VARCHAR(255) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DealerIncentive_month_idx`(`month`),
    UNIQUE INDEX `DealerIncentive_month_employeeId_key`(`month`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DealerIncentive` ADD CONSTRAINT `DealerIncentive_employeeId_fkey`
  FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
