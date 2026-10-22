-- 상담 종류에 '타사'를 더한다.
--
-- 다른 상사 차를 손님에게 붙이는 건이다. 들어오는 길이 카모두/카매니저 같은 딜러
-- 플랫폼이라 자사 상담과 섞어 세면 어느 쪽이 얼마나 들어오는지 알 수 없다.
--
-- 지난 상담은 그대로 둔다 — 값을 더하는 것뿐이라 쌓인 건은 안 건드린다.
ALTER TABLE `Consultation`
  MODIFY `kind` ENUM('SALE', 'PARTNER', 'BROKERAGE', 'EXPORT', 'OTHER') NOT NULL DEFAULT 'BROKERAGE';
