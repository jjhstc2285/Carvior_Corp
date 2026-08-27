-- AlterTable
-- 알선 상담을 카톡 양식(플랫폼/차량번호/차명/손님번호/내용)에 맞춘다.
ALTER TABLE `Consultation`
    ADD COLUMN `platform` VARCHAR(30) NOT NULL DEFAULT '',
    ADD COLUMN `vehicleName` VARCHAR(60) NOT NULL DEFAULT '',
    ADD COLUMN `customerPhone` VARCHAR(20) NOT NULL DEFAULT '',
    MODIFY `customerName` VARCHAR(191) NOT NULL DEFAULT '';

-- 고객명 칸에 전화번호를 적어둔 상담이 있다면 손님번호 칸으로 옮긴다.
-- 숫자·하이픈뿐이고 0으로 시작하는 것만 번호로 본다(이름은 그대로 둔다).
UPDATE `Consultation`
SET `customerPhone` = `customerName`, `customerName` = ''
WHERE `customerName` REGEXP '^0[0-9-]{8,15}$';

-- CreateIndex — 이제 손님번호로 찾는다
CREATE INDEX `Consultation_customerPhone_idx` ON `Consultation`(`customerPhone`);

-- DropIndex
DROP INDEX `Consultation_customerName_idx` ON `Consultation`;
