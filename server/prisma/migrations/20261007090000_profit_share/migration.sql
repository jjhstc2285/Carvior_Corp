-- 매도정산 — 이 차 판매수익을 몇 대 몇으로 나누는가. NEW(신차) 30% / PERSON(개인) 50%.
-- 비어 있으면 아직 안 정한 것이다(0원).
ALTER TABLE `PurchaseSettlement` ADD COLUMN `profitShare` VARCHAR(10) NOT NULL DEFAULT '';
