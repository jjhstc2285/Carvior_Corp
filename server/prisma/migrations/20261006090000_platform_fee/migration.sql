-- 플랫폼 수수료. 헤이딜러·엔카 경매장에서 사오면 그쪽에 내는 돈이라
-- 상품화가 아니라 매입 쪽(이전비·구전과 같은 자리)에 붙는다.
ALTER TABLE `PurchaseSettlement` ADD COLUMN `platformFee` INTEGER NOT NULL DEFAULT 0;
