-- 매입 정산 금액 단위를 '만원'에서 '원'으로 바꾼다.
--
-- 광택 35,000원처럼 만원으로 안 떨어지는 비용이 흔한데, 만원 정수로는 3.5를 담을 수 없었다.
-- 소수로 저장하면 더할 때 오차가 생기므로 원 단위 정수로 두고 화면에서 만원으로 환산한다.
--
-- 컬럼 타입은 그대로 INT다. 값만 10,000배 한다.
-- INT 상한은 21억이라 원 단위로도 매입가·정산금액을 담기에 충분하다.

UPDATE `PurchaseSettlement`
SET `transferFee`      = `transferFee` * 10000,
    `purchasePrice`    = `purchasePrice` * 10000,
    `brokerFee`        = `brokerFee` * 10000,
    `settlementAmount` = `settlementAmount` * 10000;

-- 상품화 비용 명세는 직전 마이그레이션에서 만원 값으로 채워졌다.
UPDATE `PurchasePrepCost` SET `amount` = `amount` * 10000;
