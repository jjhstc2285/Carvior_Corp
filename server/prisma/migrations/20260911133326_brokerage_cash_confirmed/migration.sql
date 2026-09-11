-- 현금 수수료를 대표가 실제로 받았는지. 언제 확인했는지를 같이 남긴다.
ALTER TABLE `BrokerageSettlement` ADD COLUMN `cashConfirmedAt` DATETIME(3) NULL;
