-- 자리에 매이지 않는 비용 — 사무실 부대비용.
--
-- 인터넷·정수기·복합기처럼 매달 자동이체로 빠져나가는데 어느 건물 것도 아닌 돈이 있다.
-- 아무 자리 밑에 넣어두면 그 자리 고정비가 부풀어 자리끼리 비교가 안 된다.
-- propertyId 를 비워 두는 줄이 그것이다.
ALTER TABLE `PropertyCost` MODIFY COLUMN `propertyId` VARCHAR(191) NULL;
