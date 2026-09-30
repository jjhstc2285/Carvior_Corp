-- 몇 건인가. 클리닉처럼 달마다 열몇 건씩 붙는 비용은 금액만 적어두면
-- 다음 달과 견줄 데가 없다 — 건당 얼마였는지가 남게 건수를 같이 적는다.
ALTER TABLE `PanelInvoiceTotal` ADD COLUMN `count` INTEGER NOT NULL DEFAULT 0;
