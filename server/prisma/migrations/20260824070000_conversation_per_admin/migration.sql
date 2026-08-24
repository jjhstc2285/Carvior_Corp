-- 대화를 (직원, 관리자) 쌍마다 하나로 쪼갠다.
-- 기존에는 직원당 하나였고 관리자 전원이 같은 방에 들어와 답했다.

-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `adminId` VARCHAR(191) NULL;

-- 기존 대화의 상대 관리자를 채운다.
-- ① 그 대화에서 마지막으로 답한 관리자를 상대로 본다(실제로 대화한 사람이다).
UPDATE `Conversation` c
SET `adminId` = (
    SELECT m.`senderId`
    FROM `ChatMessage` m
    JOIN `Employee` e ON e.`id` = m.`senderId`
    WHERE m.`conversationId` = c.`id` AND e.`role` = 'ADMIN'
    ORDER BY m.`createdAt` DESC
    LIMIT 1
);

-- ② 관리자가 한 번도 답한 적 없는 대화(직원이 말만 걸어둔 경우)는
--    가장 먼저 만들어진 관리자에게 붙인다 — 내용을 잃지 않는 쪽을 택한다.
UPDATE `Conversation`
SET `adminId` = (SELECT `id` FROM `Employee` WHERE `role` = 'ADMIN' ORDER BY `createdAt` ASC LIMIT 1)
WHERE `adminId` IS NULL;

-- ③ 관리자가 한 명도 없으면 붙일 상대가 없다. 그 상태의 대화는 열 수 없으므로 정리한다
--    (메시지는 FK Cascade로 같이 지워진다). 관리자가 있는 정상 설치에서는 0건이다.
DELETE FROM `Conversation` WHERE `adminId` IS NULL;

-- AlterTable
ALTER TABLE `Conversation` MODIFY `adminId` VARCHAR(191) NOT NULL;

-- CreateIndex
-- 새 인덱스를 먼저 만든다. employeeId가 맨 앞이라 기존 FK가 이 인덱스를 쓸 수 있고,
-- 그래야 다음 줄의 DROP이 "외래키가 쓰는 인덱스"라는 이유로 거부되지 않는다.
CREATE UNIQUE INDEX `Conversation_employeeId_adminId_key` ON `Conversation`(`employeeId`, `adminId`);
CREATE INDEX `Conversation_adminId_idx` ON `Conversation`(`adminId`);

-- DropIndex — 직원당 하나였던 제약을 푼다
DROP INDEX `Conversation_employeeId_key` ON `Conversation`;

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
