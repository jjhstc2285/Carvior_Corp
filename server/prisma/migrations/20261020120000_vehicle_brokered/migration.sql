-- 알선차 표.
--
-- 남의 상사 차를 알선으로 팔면 매도는 매도인데 우리가 판 대수에 섞이면 안 된다.
-- 사무장이 오늘 매도 대수를 보는데 알선 건이 끼어 있으면 나중에 맞춰볼 수가 없다.
--
-- 차량 관리에 없어도 되는 차지만 언제 무엇을 넘겼는지는 남아야 해서 줄은 만든다 —
-- 대신 이 표를 달고 집계에서 뺀다.
ALTER TABLE `ManagedVehicle` ADD COLUMN `brokered` BOOLEAN NOT NULL DEFAULT false;
