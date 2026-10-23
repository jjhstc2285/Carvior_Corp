-- 제시 금융에 매도금액 칸을 둔다.
--
-- 차가 얼마에 나갔는지가 네 곳에 적힌다 — 상담 등록, 제시 금융, 알선 정산의 실
-- 차량판매가, 매입 정산의 차량판매가. 같은 값인데 적는 자리가 달라서 화면마다
-- 다른 숫자가 떴다. 어디서 적든 나머지 셋에 같이 들어가게 한다.
ALTER TABLE `ManagedVehicle` ADD COLUMN `salePrice` INT NOT NULL DEFAULT 0;
