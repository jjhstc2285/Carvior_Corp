-- 외부주차장 세차. 상품화의 '광택·세차'와 다른 항목이다 —
-- 그쪽은 팔려고 한 번 맡기는 일이고, 이건 세워 둔 차를 계속 닦는 관리비다.
ALTER TABLE `VehicleExpense`
  MODIFY `kind` ENUM('FUEL', 'BATTERY', 'PARKING', 'REPAIR', 'WASH', 'ETC') NOT NULL;
