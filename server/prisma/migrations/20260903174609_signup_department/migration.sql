-- 가입 신청에 소속 팀. 승인할 때 직원 부서로 그대로 넘어간다.
ALTER TABLE `SignupRequest`
  ADD COLUMN `department` VARCHAR(30) NOT NULL DEFAULT '';
