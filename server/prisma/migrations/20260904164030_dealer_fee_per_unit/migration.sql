-- 대당으로 받는 영업소 — 그 달 매입 대수로 회비가 정해진다.
-- 매입 관리의 '매입처'와 업체명 표기가 달라 매칭 키워드를 따로 받는다.
ALTER TABLE `DealerFeeAccount`
  ADD COLUMN `perUnitFee` INT NOT NULL DEFAULT 0,
  ADD COLUMN `matchKeywords` VARCHAR(255) NOT NULL DEFAULT '';
