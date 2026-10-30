-- 인건비에 인센티브 칸.
--
-- 급여에 섞어 적으면 그 사람 기본급이 얼마인지 알 수 없게 된다. 급여는 정해진 값이고
-- 인센티브는 달마다 바뀌는 값이라, 섞어 두면 다음 달에 어디까지가 기본급이었는지
-- 되짚을 수가 없다.
ALTER TABLE `PayrollEntry` ADD COLUMN `incentive` INTEGER NOT NULL DEFAULT 0;
