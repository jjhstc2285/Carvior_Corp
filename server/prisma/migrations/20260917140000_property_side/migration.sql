-- 우리가 빌려 쓰는 자리인지(임차), 빌려준 자리인지(임대).
-- 지금까지 적어둔 건 전부 우리가 빌려 쓰는 자리라 기본값이 '임차'다.
ALTER TABLE `Property` ADD COLUMN `side` VARCHAR(10) NOT NULL DEFAULT '임차';
