-- 상조회(신차영업소)에 사진 한 장을 붙인다.
--
-- 명함·간판·약정서처럼 글로 못 적는 것이 있다. 지금은 각자 휴대폰에 남아서, 찾으려면
-- 찍은 사람을 찾아 다녀야 한다.
--
-- 한 장만 받는다. 여러 장을 받으면 어느 게 지금 맞는 것인지 아무도 모른다.
ALTER TABLE `DealerFeeAccount` ADD COLUMN `photo` VARCHAR(300) NOT NULL DEFAULT '';
