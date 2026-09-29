-- 경조사비 대장. 화환은 금액과 따로 둔다 — 늘 얹는 것이라 합치면 축의금이 얼마였는지가 사라진다.
CREATE TABLE `Condolence` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('FUNERAL', 'WEDDING', 'HOLIDAY', 'ETC') NOT NULL,
    `person` VARCHAR(40) NOT NULL,
    `relation` VARCHAR(30) NOT NULL DEFAULT '',
    `subject` VARCHAR(30) NOT NULL DEFAULT '',
    `eventOn` DATE NOT NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `wreath` BOOLEAN NOT NULL DEFAULT false,
    `wreathPrice` INTEGER NOT NULL DEFAULT 0,
    `place` VARCHAR(80) NOT NULL DEFAULT '',
    `memo` VARCHAR(191) NOT NULL DEFAULT '',
    `recordedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Condolence_eventOn_idx`(`eventOn`),
    INDEX `Condolence_kind_idx`(`kind`),
    INDEX `Condolence_recordedById_idx`(`recordedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Condolence` ADD CONSTRAINT `Condolence_recordedById_fkey`
    FOREIGN KEY (`recordedById`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
