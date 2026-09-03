-- 재고(할부사·금액)와 상환일자를 차량 관리 한 곳에서만 적기로 했다.
-- 매입리스트에 이미 적혀 있던 값을 차량 관리로 옮긴다.
--
-- 차량 관리 쪽이 아직 비어 있을 때만 채운다 — 차량 관리에서 이미 손본 값을
-- 옛 대장 값으로 덮으면 안 된다.
--
-- 같은 차량번호가 매입리스트에 여러 줄 있으면 가장 최근에 적은 줄을 쓴다.
UPDATE `ManagedVehicle` mv
JOIN (
  SELECT p.vehicleNumber, p.stockCapital, p.stockAmount, p.repayDate
  FROM `PurchaseListItem` p
  JOIN (
    SELECT vehicleNumber, MAX(updatedAt) AS latest
    FROM `PurchaseListItem`
    WHERE stockAmount > 0 OR stockCapital IS NOT NULL OR repayDate IS NOT NULL
    GROUP BY vehicleNumber
  ) newest ON newest.vehicleNumber = p.vehicleNumber AND newest.latest = p.updatedAt
) src ON src.vehicleNumber = mv.vehicleNumber
SET
  mv.stockCapital = COALESCE(NULLIF(src.stockCapital, 'x'), ''),
  mv.stockAmount  = src.stockAmount,
  mv.repayDate    = src.repayDate
WHERE mv.stockAmount = 0 AND mv.stockCapital = '' AND mv.repayDate IS NULL;
