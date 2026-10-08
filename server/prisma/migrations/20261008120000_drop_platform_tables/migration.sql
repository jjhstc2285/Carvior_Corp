-- 플랫폼 표를 들어낸다.
--
-- 시트를 테이블로 떠서 관리하려 했는데, 값이 엔카·차차차에서 수식으로 들어오는 장이라
-- 시트에서 보는 쪽이 낫다는 결론이다. 앱은 시트를 띄우기만 한다.
--
-- 지우는 migration 을 따로 두는 이유: 만든 migration 을 폴더에서 빼면 이미 돌린 상자와
-- 기록이 어긋난다. 만들고 지운 자취를 그대로 남긴다.
DROP TABLE IF EXISTS `PlatformIssue`;
DROP TABLE IF EXISTS `PlatformAccount`;
DROP TABLE IF EXISTS `PlatformListing`;
