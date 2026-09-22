-- 지난 상담을 판매로 옮긴다.
--
-- 분류가 알선 하나뿐일 때 쌓인 것들이라 우리 물건을 우리가 판 건(판매)까지 전부 알선으로
-- 들어가 있다. 실제로 남의 상사 물건을 판 건은 내용에 '타딜러'·'타 상사'처럼 적어 두는
-- 버릇이 있어서, 그 말이 들어간 건만 알선으로 남기고 나머지를 판매로 옮긴다.
--
-- 수출·기타는 건드리지 않는다. 옮기고 나서 아닌 게 보이면 화면에서 한 건씩 되돌리면 된다.
UPDATE `Consultation`
SET `kind` = 'SALE'
WHERE `kind` = 'BROKERAGE'
  AND `content` NOT LIKE '%타딜%'
  AND `content` NOT LIKE '%타 딜%'
  AND `content` NOT LIKE '%다른딜%'
  AND `content` NOT LIKE '%다른 딜%'
  AND `content` NOT LIKE '%타상사%'
  AND `content` NOT LIKE '%타 상사%'
  AND `content` NOT LIKE '%타사%';
