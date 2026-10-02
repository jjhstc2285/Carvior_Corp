-- 카모두수정 — 수정 들어간 차. 자리에 있어도 손대면 안 된다.
ALTER TABLE `ParkingVehicle` MODIFY `status` ENUM('DISPLAY', 'SOLD', 'RESERVED', 'MOVING', 'REPAIR') NOT NULL DEFAULT 'DISPLAY';
