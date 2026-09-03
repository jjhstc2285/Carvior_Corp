-- 세부모델(등급). 카비어에서 받아온 계약에는 등급이 없어 비워둔 채로 들어온다.
ALTER TABLE `PurchaseIntake`
  ADD COLUMN `detailModel` VARCHAR(120) NOT NULL DEFAULT '';
