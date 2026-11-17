-- 출근 제한(IP 화이트리스트 · 출근 단말)을 걷어낸다.
--
-- 애니원 사무실 한 곳을 전제로 만든 기능이다 — 사무실 공인 IP를 등록해 두고 그 안에서만,
-- 자리 PC 브라우저에 심어둔 키가 있어야 출근이 찍혔다. 여러 상사가 쓰는 제품에서는
-- 성립하지 않는다: 상사마다 사무실이 다르고, 공유기를 바꾸면 IP가 바뀌고, 애초에
-- 폰으로 출근하는 사람이 많다. 상사마다 IP를 받아 등록해 주는 일도 할 수 없다.
--
-- 출근은 이제 로그인한 사람이 누르면 찍힌다.
--
-- 지워지는 자료는 "어느 IP·어느 PC에서 찍게 할지"라는 설정뿐이다.
-- 출근 기록(AttendanceRecord) 자체는 건드리지 않는다.

DROP TABLE IF EXISTS `IpWhitelist`;
DROP TABLE IF EXISTS `AttendanceDevice`;

-- 가입 신청에 달려 있던 브라우저 지문 — 승인할 때 출근 단말로 등록하는 데만 쓰였다
ALTER TABLE `SignupRequest` DROP COLUMN `fingerprint`;
