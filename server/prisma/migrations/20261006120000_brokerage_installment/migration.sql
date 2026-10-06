-- 어느 캐피탈로 얼마를 깔았는가. 재고금융 약정을 채웠는지 세는 값이다.
-- 상담에도 같은 칸이 있지만 거기는 비어 있는 건이 많아, 돈이 오간 뒤에 적는 정산에도 둔다.
ALTER TABLE `BrokerageSettlement`
  ADD COLUMN `installmentCapital` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `installmentAmount` INTEGER NOT NULL DEFAULT 0;
