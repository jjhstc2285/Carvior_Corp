-- 차량번호 띄어쓰기를 지운다.
--
-- '12가3456' 과 '12가 3456' 이 섞여 들어와서 화면마다 같은 차를 다른 차로 봤다.
-- 출고 예정이 안 잡히고, 매입가가 빈칸이고, 알선 정산의 판매금액이 안 넘어온 게
-- 전부 같은 원인이었다. 앞으로는 저장할 때 정리해서 넣는다.
UPDATE `PurchaseSettlement` SET `vehicleNumber` = REPLACE(`vehicleNumber`, ' ', '') WHERE `vehicleNumber` LIKE '% %';
UPDATE `BrokerageSettlement` SET `vehicleNumber` = REPLACE(`vehicleNumber`, ' ', '') WHERE `vehicleNumber` LIKE '% %';
UPDATE `PurchaseIntake` SET `vehicleNumber` = REPLACE(`vehicleNumber`, ' ', '') WHERE `vehicleNumber` LIKE '% %';
UPDATE `Consultation` SET `vehicleNumber` = REPLACE(`vehicleNumber`, ' ', '') WHERE `vehicleNumber` LIKE '% %';
