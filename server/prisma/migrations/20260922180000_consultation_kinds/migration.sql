-- 상담 분류를 넷으로 — 누구 물건을 누가 파느냐로 갈린다.
--  SALE      우리 담당자가 우리 상사 물건
--  BROKERAGE 우리 담당자가 남의 상사 물건 (알선)
--  EXPORT    수출
--  OTHER     남의 딜러가 우리 상사 물건 — 담당자가 우리 직원이 아니다
--
-- 같은 enum 을 정산(BrokerageSettlement)도 쓴다. 둘 다 늘려야 한 쪽만 새 값을 받는 일이 없다.
ALTER TABLE `Consultation`
  MODIFY COLUMN `kind` ENUM('SALE', 'BROKERAGE', 'EXPORT', 'OTHER') NOT NULL DEFAULT 'BROKERAGE';

ALTER TABLE `BrokerageSettlement`
  MODIFY COLUMN `kind` ENUM('SALE', 'BROKERAGE', 'EXPORT', 'OTHER') NOT NULL DEFAULT 'BROKERAGE';

-- 기타 상담에서 판 사람 — 남의 딜러나 그 상사 이름. 우리 직원이 아니라 이름만 받아 둔다.
ALTER TABLE `Consultation` ADD COLUMN `outsideDealer` VARCHAR(60) NOT NULL DEFAULT '';
