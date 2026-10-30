-- 알선·수출 정산에 유입경로를 적는다.
--
-- 상담에도 같은 칸이 있지만 상담 없이 정산만 올라오는 건이 많다. 그러면 '어느 길로
-- 들어온 돈인지'가 통째로 비어서, 광고비를 어디에 쓸지 가릴 근거가 없다.
ALTER TABLE `BrokerageSettlement` ADD COLUMN `platform` VARCHAR(40) NOT NULL DEFAULT '';
