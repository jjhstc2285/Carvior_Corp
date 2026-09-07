-- 알선 정산을 만원에서 원 단위로 옮긴다.
-- 할부 피처럼 12,345원으로 떨어지는 값이 있어 만원으로는 담기지 않는다.
--
-- 이미 원으로 들어간 줄이 섞여 있을 수 있어(예전에 손으로 넣은 건) 만 배 하면 INT 가
-- 넘친다. 그래서 '만원으로 보이는 줄'만 옮긴다 — 가장 큰 값이 100만(=100억원)보다
-- 작으면 만원으로 적힌 것이다. 중고차 한 대가 100억일 수는 없다.
UPDATE `BrokerageSettlement`
SET
  `totalSaleAmount`    = `totalSaleAmount`    * 10000,
  `ownerDeposit`       = `ownerDeposit`       * 10000,
  `transferFee`        = `transferFee`        * 10000,
  `transferFeeBalance` = `transferFeeBalance` * 10000,
  `cashCommission`     = `cashCommission`     * 10000,
  `installmentFee`     = `installmentFee`     * 10000,
  `insuranceFee`       = `insuranceFee`       * 10000,
  `etcCost`            = `etcCost`            * 10000,
  `settlementAmount`   = `settlementAmount`   * 10000
WHERE GREATEST(
  `totalSaleAmount`, `ownerDeposit`, `transferFee`, `transferFeeBalance`,
  `cashCommission`, `installmentFee`, `insuranceFee`, `etcCost`, `settlementAmount`
) < 1000000;
