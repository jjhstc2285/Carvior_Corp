-- 주차된 모습(전면) 사진 한 장.
ALTER TABLE `ParkingVehicle`
  ADD COLUMN `photoUrl` VARCHAR(255) NOT NULL DEFAULT '';
