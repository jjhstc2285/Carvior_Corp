-- 어느 항목의 청구서인가. 판금만 오는 게 아니라 광택도 온다 —
-- 광택 총액이 판금 칸에 얹히면 안 된다. 지금까지 적힌 건 전부 판금이다.
ALTER TABLE `PanelInvoiceTotal` ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'DENT';
