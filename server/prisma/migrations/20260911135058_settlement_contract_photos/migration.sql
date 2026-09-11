-- 계약서 사진 경로. 여러 장이 될 수 있어 줄바꿈으로 이어 담는다.
-- 실물 계약서를 들고 결재받으러 다니는 걸 없애려고 올릴 때 같이 붙인다.
ALTER TABLE `PurchaseSettlement` ADD COLUMN `contractPhotos` TEXT NOT NULL;
