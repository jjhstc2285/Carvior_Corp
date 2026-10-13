-- 경조사비 대장에 연락처. 받은 쪽은 나중에 갚는데, 그때 연락할 번호가 대장에 없으면
-- 또 수소문하게 된다. 적어 두기만 한다(문자 보내기는 건당 돈이 들어 따로 정한다).
ALTER TABLE `Condolence` ADD COLUMN `phone` VARCHAR(20) NOT NULL DEFAULT '';
