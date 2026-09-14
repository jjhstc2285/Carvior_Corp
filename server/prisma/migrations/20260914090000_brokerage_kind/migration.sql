-- 알선 정산과 수출 정산을 가른다. 적는 칸도 계산도 같아서 한 칸으로만 나눈다.
ALTER TABLE `BrokerageSettlement`
  ADD COLUMN `kind` ENUM('BROKERAGE', 'EXPORT') NOT NULL DEFAULT 'BROKERAGE';
