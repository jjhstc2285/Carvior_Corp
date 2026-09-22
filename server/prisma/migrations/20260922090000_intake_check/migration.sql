-- 실차 검차 — 차를 보러 가서 확인한 것들과 거기서 센 개수.
--
-- 확인한 항목은 키를 쉼표로 이어 한 칸에 담는다. 항목이 늘 때마다 칸을 늘리면
-- 마이그레이션이 계속 붙는데, 확인했다/안 했다 두 값뿐이라 이걸로 충분하다.
ALTER TABLE `PurchaseIntake`
  ADD COLUMN `checkedItems`   VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN `panelCount`     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN `dentCount`      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN `dentLargeCount` INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN `prepVendor`     VARCHAR(10)  NOT NULL DEFAULT '',
  ADD COLUMN `imported`       BOOLEAN      NOT NULL DEFAULT false;
