-- 상사 정산서 맨 아래 '실제지급액' — 통장에 실제로 들어온 돈.
-- 매입가·재고금융·세금이 이미 빠진 금액이라, 적어 두면 판매수익을 이걸로 낸다.
-- 0이면 안 적은 것이고, 그때는 예전처럼 차량판매가에서 비용을 빼서 낸다.
ALTER TABLE `PurchaseSettlement` ADD COLUMN `payoutAmount` INTEGER NOT NULL DEFAULT 0;
