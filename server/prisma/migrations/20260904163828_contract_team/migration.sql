-- 박예나·이금미는 광고팀이 아니라 계약팀이다.
-- 앞선 team_reassign 에서 광고팀으로 넣었던 걸 바로잡는다.
UPDATE `Employee` SET `department` = '계약팀'
  WHERE `name` IN ('박예나', '이금미');
