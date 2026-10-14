-- 실 차량판매가 — 차가 실제로 얼마에 나갔나.
--
-- 실차주입금은 세금을 떼고 들어온 돈이라 판매가가 아니다. 차대금업을 더해도 떼인 만큼이
-- 모자라서, 더해서 내던 값으로는 실제 판매가를 알 수 없었다. 그래서 따로 받아 적는다.
--
-- 0은 '아직 안 적음'이다. 그때는 실차주입금 + 차대금업으로 대신 보여 준다.
ALTER TABLE `BrokerageSettlement` ADD COLUMN `realSalePrice` INT NOT NULL DEFAULT 0;
