-- 외부주차장 세차 — 한 대당 1,250원.
--
-- 만 원으로 깔아 뒀는데 실제로 받는 값이 1,250원이다. 9월 205대가 205만원으로 떠서
-- 청구서와 자릿수가 달랐다.
ALTER TABLE `WashSettlement` MODIFY `unitPrice` INTEGER NOT NULL DEFAULT 1250;

-- 아직 안 치른 달은 새 값으로 고친다.
--
-- 치른 달은 안 건드린다 — 그때 그 값으로 돈이 나갔다. 지난 청구액을 뒤에서 바꾸면
-- 통장과 대장이 어긋나고, 어느 쪽이 맞는지 따질 근거가 사라진다.
UPDATE `WashSettlement` SET `unitPrice` = 1250 WHERE `paid` = 0 AND `unitPrice` = 10000;
