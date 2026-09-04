-- 팀 재배정. 앞선 assign_teams 는 '팀이 비어 있을 때만' 넣었으므로 여기서는 덮어쓴다.
-- 이름으로 맞춘다 — 동명이인이 생기면 여기서 걸러야 한다.

-- 매입팀이던 두 사람은 광고팀이다.
UPDATE `Employee` SET `department` = '광고팀'
  WHERE `name` IN ('박예나', '이금미');

-- 매입팀은 이 셋으로 다시 묶는다.
UPDATE `Employee` SET `department` = '매입팀'
  WHERE `name` IN ('이우주', '안원용', '유진욱');
