-- 중복으로 쌓인 매입 정산을 하루 두고 지운다.
--
-- 담당자 목록에 매입 뛰는 사람이 없어서, 적어 놓고도 자기 이름으로 안 잡히니 "안
-- 들어갔나" 하고 또 적었다. 같은 차가 두 줄, 세 줄이 됐다.
--
-- 바로 안 지운다. 하루 동안 줄을 그어 두고 보여 준 다음에 지운다 — 사람이 보고
-- '남겨두기'를 누를 틈이 있어야 한다.
ALTER TABLE `PurchaseSettlement`
  ADD COLUMN `deleteAt` DATETIME(3) NULL,
  ADD COLUMN `keepRow` BOOLEAN NOT NULL DEFAULT false;
