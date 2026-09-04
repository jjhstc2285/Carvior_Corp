-- 자동이체날짜 원문에서 뽑아낸 이체일(1~31). 0이면 정해진 날이 없다.
-- 원문은 그대로 두고 숫자만 따로 둔다 — 알림은 숫자로 돌고 원장은 적힌 대로 남는다.
ALTER TABLE `DealerFeeAccount`
  ADD COLUMN `transferDayOfMonth` INT NOT NULL DEFAULT 0;

-- 이미 들어간 값에서 한 번 뽑아둔다. "매달5일" → 5, "10-01" → 1, "13일" → 13.
-- 못 뽑으면 0으로 두고 화면에서 채운다.
UPDATE `DealerFeeAccount`
SET `transferDayOfMonth` = CASE
  WHEN `transferDay` REGEXP '^[0-9]{1,2}-[0-9]{1,2}$'
    THEN CAST(SUBSTRING_INDEX(`transferDay`, '-', -1) AS UNSIGNED)
  WHEN `transferDay` REGEXP '[0-9]'
    THEN CAST(REGEXP_SUBSTR(`transferDay`, '[0-9]+') AS UNSIGNED)
  ELSE 0
END
WHERE `transferDay` <> '';

-- 1~31 밖은 잘못 뽑은 것이다.
UPDATE `DealerFeeAccount` SET `transferDayOfMonth` = 0
WHERE `transferDayOfMonth` < 1 OR `transferDayOfMonth` > 31;
