-- 상담에 차량판매가.
--
-- 남의 딜러가 우리 상사 차를 팔아 주는 일이 있다. 그 건은 우리 딜러가 정산을 받지 않아서
-- 얼마에 팔렸는지를 전화를 받은 TM 말고는 아무도 모른다 — 적어 둘 칸이 없어서 그 사람
-- 머리에만 남았다.
--
-- 출고 입금액(depositAmount)과는 다른 값이다. 그건 출고할 때 들어온 돈이고 만원 단위다.
ALTER TABLE `Consultation` ADD COLUMN `salePrice` INT NOT NULL DEFAULT 0;
