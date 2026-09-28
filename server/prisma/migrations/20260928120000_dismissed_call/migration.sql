-- 치운 통화. 채널톡 통화는 그대로 두고 우리 목록에서만 가린다.
CREATE TABLE `DismissedCall` (
    `id` VARCHAR(191) NOT NULL,
    `userChatId` VARCHAR(64) NOT NULL,
    `customerPhone` VARCHAR(20) NOT NULL DEFAULT '',
    `calledAt` VARCHAR(20) NOT NULL DEFAULT '',
    `dismissedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DismissedCall_userChatId_key`(`userChatId`),
    INDEX `DismissedCall_createdAt_idx`(`createdAt`),
    INDEX `DismissedCall_dismissedById_idx`(`dismissedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DismissedCall` ADD CONSTRAINT `DismissedCall_dismissedById_fkey`
    FOREIGN KEY (`dismissedById`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
