-- 광고 상품은 '월 얼마'가 아니라 '대당 얼마'다.
--
-- 엔카 22만원 상품은 한 대 찍을 때마다 22만원이고, 분기마다 90대를 찍어야 하는 약정이
-- 붙는다. 10만원 상품은 대당 10만원이지만 대수 제약이 없다. 월 정액으로 잡아 두니
-- 안 나가는 돈이 광고비로 잡히고, 약정도 달 단위라 분기 90대를 셀 수가 없었다.
ALTER TABLE `AdContract`
  CHANGE COLUMN `monthlyFee` `unitFee` INTEGER NOT NULL DEFAULT 0,
  CHANGE COLUMN `monthlyQuota` `quotaCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `quotaCycle` VARCHAR(4) NOT NULL DEFAULT '분기';

-- 기존 계약은 '월 22만원 / 월 30대'처럼 잘못 들어가 있다. 대당 금액과 분기 대수는
-- 계산으로 알 수 없으니 0으로 비우고 다시 적게 한다 — 틀린 값이 남아 있는 편이 더 나쁘다.
UPDATE `AdContract` SET `unitFee` = 0, `quotaCount` = 0;
