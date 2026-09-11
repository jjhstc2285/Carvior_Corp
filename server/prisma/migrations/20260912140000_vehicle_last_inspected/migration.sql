-- 재검을 받은 날. 받고 나면 그날부터 다시 넉 달을 센다.
ALTER TABLE `ManagedVehicle` ADD COLUMN `lastInspectedOn` DATE NULL;
