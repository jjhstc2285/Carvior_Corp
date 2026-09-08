-- 대당 회비를 안 쓰기로 했다. 대당 단가와, 대수를 세려고 두었던 매입처 매칭 키워드를 같이 지운다.
ALTER TABLE `DealerFeeAccount`
  DROP COLUMN `perUnitFee`,
  DROP COLUMN `matchKeywords`;
