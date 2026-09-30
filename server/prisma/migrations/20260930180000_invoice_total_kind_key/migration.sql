-- 달·업체로만 묶여 있어서 같은 업체로 항목을 바꿔 적으면 앞 줄이 갈아끼워졌다.
-- 항목까지 넣어 묶는다 — 같은 집에 판금과 광택을 같이 맡길 수 있다.
DROP INDEX `PanelInvoiceTotal_month_vendor_key` ON `PanelInvoiceTotal`;
CREATE UNIQUE INDEX `PanelInvoiceTotal_month_vendor_kind_key` ON `PanelInvoiceTotal`(`month`, `vendor`, `kind`);
