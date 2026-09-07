-- 매입 정산에 판매 쪽을 붙인다.
-- 산 값과 판 값이 한 줄에 있어야 그 차 한 대에서 얼마가 남았는지가 보인다.
ALTER TABLE `PurchaseSettlement`
  ADD COLUMN `brokerFeePayout` ENUM('CASH', 'TAX_3_3', 'TAX_13_3') NOT NULL DEFAULT 'CASH',
  ADD COLUMN `salePrice` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `cashCommission` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `installmentFee` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `insuranceFee` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `dealerLoanFee` INTEGER NOT NULL DEFAULT 0;
