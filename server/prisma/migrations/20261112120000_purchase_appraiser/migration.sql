-- 매입 정산에 견적 본 사람.
--
-- 담당자는 이 정산을 적는 계약팀이고, 견적은 이우주·김진후·안원용처럼 매입을 뛰는
-- 사람이 본다. 한 칸에 섞어 두면 누가 사온 차인지 모른다.
--
-- 매입 관리의 '실차 확인자'에 적으라고 했더니 그 화면까지 들어가는 게 번거로워 다들
-- 안 적었다 — 정산 창에서 바로 고르게 둔다.
ALTER TABLE `PurchaseSettlement` ADD COLUMN `appraiser` VARCHAR(30) NOT NULL DEFAULT '';
