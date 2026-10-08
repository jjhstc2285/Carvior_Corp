-- 매도정산을 이미 받았는가. 받은 건은 이번 달 받을 돈에서 빠진다.
-- 줄을 지우면 그 차가 얼마였는지가 같이 사라지므로 지우지 않고 표시만 남긴다.
ALTER TABLE `PurchaseSettlement` ADD COLUMN `profitSharePaid` BOOLEAN NOT NULL DEFAULT false;
